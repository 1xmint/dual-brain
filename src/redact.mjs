#!/usr/bin/env node
// redact.mjs — Secret redaction utility for dual-brain orchestrator.
// SAFETY-CRITICAL: nothing reaches AI dispatch without passing through redaction.
// All functions are synchronous and regex-based — no external dependencies.
// Exports: redact, redactFiles, isSecretFile

import { basename, extname } from 'node:path';

// ─── Non-secret placeholder values (skip redaction) ──────────────────────────
const PLACEHOLDER_PATTERN = /^(xxx+|changeme|placeholder|your[_-].+|example|fake|dummy|test|none|null|true|false|0|1|<[^>]+>|\$\{[^}]+\}|%[A-Z_]+%|\*+|\.+)$/i;

// ─── Secret patterns ──────────────────────────────────────────────────────────
// Each entry: { pattern: RegExp, replacer: Function|string }
// replacer receives the full match; return the redacted string.
// IMPORTANT: Only redact the value portion, not the key name.

const REDACT_PATTERNS = [
  // .env-style: KEY=VALUE (key contains KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH)
  {
    pattern: /\b([A-Z_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH)[A-Z_]*\s*=\s*)([^\s\n"'`]+)/gi,
    replacer: (_m, key, _kw, val) => isPlaceholder(val) ? _m : `${key}[REDACTED]`,
  },

  // Explicit named keys (case-insensitive) with = or : assignment
  // Covers: API_KEY=, OPENAI_API_KEY=, ANTHROPIC_API_KEY=, etc.
  {
    pattern: /\b((?:api[_-]?key|openai[_-]api[_-]key|anthropic[_-]api[_-]key|aws[_-]secret[_-]access[_-]key|aws[_-]access[_-]key[_-]id|private[_-]key|passwd)\s*[=:]\s*["'`]?)([^\s"'`\n,;]+)(["'`]?)/gi,
    replacer: (_m, prefix, val, suffix) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]${suffix}`,
  },

  // Passwords: password=xxx / PASSWORD="xxx" / passwd: xxx
  {
    pattern: /\b(passwords?\s*[=:]\s*["'`]?)([^\s"'`\n,;]+)(["'`]?)/gi,
    replacer: (_m, prefix, val, suffix) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]${suffix}`,
  },

  // Bearer tokens: Bearer xxx / Authorization: Bearer xxx
  {
    pattern: /(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/g,
    replacer: (_m, prefix, val) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]`,
  },

  // Authorization header value (non-Bearer forms)
  {
    pattern: /(Authorization\s*:\s*)([^\s\n][^\n]*)/gi,
    replacer: (_m, prefix, val) => {
      const trimmed = val.trim();
      if (isPlaceholder(trimmed)) return _m;
      // Keep the auth scheme visible (Basic, Digest, etc.) but redact the credential
      const schemeMatch = trimmed.match(/^(\w+)\s+(.+)$/);
      if (schemeMatch) return `${prefix}${schemeMatch[1]} [REDACTED]`;
      return `${prefix}[REDACTED]`;
    },
  },

  // AWS credentials
  {
    pattern: /\b((?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key|AWS_ACCESS_KEY_ID|aws_access_key_id)\s*[=:]\s*["'`]?)([^\s"'`\n,;]+)(["'`]?)/g,
    replacer: (_m, prefix, val, suffix) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]${suffix}`,
  },

  // Connection strings: ://user:password@host
  {
    pattern: /([\w+.-]+:\/\/[^:@\s]+:)([^@\s]+)(@)/g,
    replacer: (_m, prefix, pass, at) => isPlaceholder(pass) ? _m : `${prefix}[REDACTED]${at}`,
  },

  // Inline JSON: "api_key": "value", "secret": "...", "token": "..."
  {
    pattern: /("(?:api[_-]?key|secret|token|password|passwd|credential|auth[_-]?key|private[_-]?key)"\s*:\s*")([^"]*?)(")/gi,
    replacer: (_m, prefix, val, suffix) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]${suffix}`,
  },

  // Inline JSON with single quotes
  {
    pattern: /('(?:api[_-]?key|secret|token|password|passwd|credential|auth[_-]?key|private[_-]?key)'\s*:\s*')([^']*?)(')/gi,
    replacer: (_m, prefix, val, suffix) => isPlaceholder(val) ? _m : `${prefix}[REDACTED]${suffix}`,
  },

  // Common secret value prefixes: sk-, pk_, ghp_, gho_, npm_, pypi-
  // Match these as standalone tokens (not inside process.env.X or function calls)
  {
    pattern: /(?<![.\w])(sk-[A-Za-z0-9\-_]{8,}|pk_(?:live|test)_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|gho_[A-Za-z0-9]{8,}|npm_[A-Za-z0-9]{8,}|pypi-[A-Za-z0-9\-]{8,})/g,
    replacer: '[REDACTED]',
  },
];

// ─── Secret file patterns ─────────────────────────────────────────────────────

const SECRET_FILE_PATTERNS = [
  // .env files
  /(?:^|\/)\.env(?:\.[a-zA-Z0-9._-]+)?$/,
  // Credential / service-account JSON files
  /(?:^|\/)(?:credentials|service-account|serviceaccount)(?:\.[a-zA-Z0-9._-]+)?\.json$/i,
  // Private key files
  /\.pem$/i,
  /\.key$/i,
  // Git internals
  /(?:^|\/)\.git\//,
  // node_modules
  /(?:^|\/)node_modules\//,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlaceholder(value) {
  if (!value) return true;
  return PLACEHOLDER_PATTERN.test(value.trim());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan text for common secret patterns and replace values with [REDACTED].
 * Returns the cleaned text. Fast — pure regex, no I/O.
 *
 * @param {string} text
 * @returns {string}
 */
function redact(text) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  for (const { pattern, replacer } of REDACT_PATTERNS) {
    // Reset lastIndex for global regexes to avoid skipped matches
    pattern.lastIndex = 0;

    if (typeof replacer === 'string') {
      result = result.replace(pattern, replacer);
    } else {
      result = result.replace(pattern, replacer);
    }

    // Reset again after use
    pattern.lastIndex = 0;
  }

  return result;
}

/**
 * Given a list of file paths, return a Set of paths that should NOT be sent
 * as context to agents (secret files, .git, node_modules).
 *
 * @param {string[]} filePaths
 * @param {string} [cwd]
 * @returns {Set<string>}
 */
function redactFiles(filePaths, cwd) {
  const blocked = new Set();
  for (const fp of filePaths) {
    if (isSecretFile(fp)) blocked.add(fp);
  }
  return blocked;
}

/**
 * Returns true if the file path matches known secret/sensitive patterns.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isSecretFile(filePath) {
  if (!filePath) return false;
  // Normalise Windows separators
  const normalised = filePath.replace(/\\/g, '/');
  return SECRET_FILE_PATTERNS.some(p => p.test(normalised));
}

// ─── CLI (smoke test) ─────────────────────────────────────────────────────────
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const samples = [
    'OPENAI_API_KEY=sk-abc123secretvalue',
    'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
    'password=changeme',
    'password=supersecret123',
    '{"api_key": "sk-proj-abcdefgh12345678"}',
    'process.env.API_KEY',
    'getSecret("my-key")',
    'connect postgresql://admin:s3cr3t@db.host.com/mydb',
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'ghp_ABCDEF1234567890abcdef1234567890',
  ];
  for (const s of samples) {
    console.log(`IN : ${s}`);
    console.log(`OUT: ${redact(s)}`);
    console.log();
  }
}

export { redact, redactFiles, isSecretFile };
