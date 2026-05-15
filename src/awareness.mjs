/**
 * awareness.mjs — Environment awareness layer for dual-brain.
 * Scans runtime environment once on startup and caches results with TTL.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

let _cache = null;
let _cacheTime = 0;

function safeExec(cmd, timeoutMs = 2000) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    }).trim();
  } catch {
    return null;
  }
}

function extractVersion(output) {
  if (!output) return null;
  const m = output.match(/(\d+\.\d+[\.\d]*)/);
  return m ? m[1] : null;
}

function probeToolAvailability(name) {
  const path = safeExec(`which ${name}`);
  if (!path) return { available: false, version: null };
  if (name === 'rg' || name === 'replit' || name === 'gh') {
    return { available: true };
  }
  const versionOutput = safeExec(`${name} --version`);
  return { available: true, version: extractVersion(versionOutput) };
}

function detectContainerType() {
  const env = process.env;
  if (env.REPL_ID || env.REPL_SLUG) return 'replit';
  if (env.CODESPACES) return 'codespace';
  if (env.CI || env.GITHUB_ACTIONS || env.GITLAB_CI || env.JENKINS_URL) return 'ci';
  return 'local';
}

function scanSecrets() {
  const keys = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'NPM_TOKEN',
    'DATABASE_URL',
    'GITHUB_TOKEN',
    'REPLIT_DB_URL',
  ];
  const result = {};
  for (const key of keys) {
    result[key] = Boolean(process.env[key]);
  }
  return result;
}

function scanReplitTools() {
  const home = homedir();
  const candidates = [
    join(home, '.replit-tools'),
    join('/home/runner/workspace', '.replit-tools'),
    join(process.cwd(), '.replit-tools'),
  ];

  let toolsDir = null;
  for (const c of candidates) {
    if (existsSync(c)) {
      toolsDir = c;
      break;
    }
  }

  if (!toolsDir) {
    return { installed: false, version: null, sessionArchivePath: null, capabilities: [] };
  }

  let version = null;
  const versionFile = join(toolsDir, '.version');
  if (existsSync(versionFile)) {
    try { version = readFileSync(versionFile, 'utf8').trim() || null; } catch { /* skip */ }
  }

  const persistentBase = join(toolsDir, '.claude-persistent');
  const projectDir = join(persistentBase, 'projects');
  let sessionArchivePath = null;
  if (existsSync(projectDir)) {
    sessionArchivePath = projectDir;
  } else if (existsSync(persistentBase)) {
    sessionArchivePath = persistentBase;
  }

  const capabilities = [];
  if (existsSync(join(toolsDir, '.claude-persistent'))) capabilities.push('sessions');
  const hasSearch = existsSync(join(toolsDir, 'search')) || existsSync(join(toolsDir, 'search.mjs'));
  if (hasSearch) capabilities.push('search');
  const hasContext = existsSync(join(toolsDir, 'context')) || existsSync(join(toolsDir, 'context.mjs'));
  if (hasContext) capabilities.push('context');
  const hasMcp = existsSync(join(toolsDir, 'mcp-server')) || existsSync(join(toolsDir, 'mcp'));
  if (hasMcp) capabilities.push('mcp');

  return { installed: true, version, sessionArchivePath, capabilities };
}

function scanReplit(cwd) {
  const env = process.env;
  const isReplit = Boolean(env.REPL_ID || env.REPL_SLUG);

  let hasDeployments = false;
  const replitConfigPath = join(cwd, '.replit');
  if (existsSync(replitConfigPath)) {
    try {
      const content = readFileSync(replitConfigPath, 'utf8');
      hasDeployments = content.includes('[deployment]');
    } catch { /* skip */ }
  }

  return {
    isReplit,
    replId: env.REPL_ID || null,
    replSlug: env.REPL_SLUG || null,
    hasDatabase: Boolean(env.DATABASE_URL),
    hasKV: Boolean(env.REPLIT_DB_URL),
    hasObjectStorage: Boolean(env.REPLIT_BUCKET_URL || env.OBJECT_STORAGE_URL),
    hasAuth: existsSync(join(cwd, '.replit-auth')) || Boolean(env.REPLIT_AUTH),
    hasDeployments,
  };
}

function scanClaudeCode(cwd) {
  const claudeDir = join(cwd, '.claude');
  const homeClaudeDir = join(homedir(), '.claude');
  const isInsideClaude = Boolean(
    process.env.CLAUDE_CODE || process.env.CLAUDE_AGENT || process.env.ANTHROPIC_CLAUDE_CODE
  );

  let hooksDir = null;
  const localHooks = join(claudeDir, 'hooks');
  const rootHooks = join(cwd, 'hooks');
  if (existsSync(localHooks)) {
    hooksDir = localHooks;
  } else if (existsSync(rootHooks)) {
    hooksDir = rootHooks;
  }

  let mcpConfigured = false;
  const mcpPaths = [
    join(claudeDir, 'mcp.json'),
    join(claudeDir, 'mcp_servers.json'),
    join(homeClaudeDir, 'mcp.json'),
  ];
  for (const p of mcpPaths) {
    if (existsSync(p)) { mcpConfigured = true; break; }
  }

  let settingsPath = null;
  const settingsCandidates = [
    join(claudeDir, 'settings.json'),
    join(homeClaudeDir, 'settings.json'),
  ];
  for (const p of settingsCandidates) {
    if (existsSync(p)) { settingsPath = p; break; }
  }

  return { isInsideClaude, hooksDir, mcpConfigured, settingsPath };
}

function scanDualBrain(cwd) {
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    version = pkg.version ?? '0.0.0';
  } catch { /* skip */ }

  const livingDocsDir = join(cwd, '.dual-brain');
  const livingDocsInit = existsSync(livingDocsDir);

  let sessionCount = 0;
  const sessionDir = join(cwd, '.dualbrain', 'sessions');
  if (existsSync(sessionDir)) {
    try {
      sessionCount = readdirSync(sessionDir).filter(f => f.endsWith('.jsonl')).length;
    } catch { /* skip */ }
  }

  const hasLedger = existsSync(join(cwd, '.dualbrain', 'ledger.jsonl'));
  const hasFailureMemory = existsSync(join(cwd, '.dualbrain', 'failures.jsonl'));

  return { version, livingDocsInit, sessionCount, hasLedger, hasFailureMemory };
}

export function scanEnvironment(cwd, options = {}) {
  const ttl = options.ttl ?? 300000;
  if (_cache && Date.now() - _cacheTime < ttl && !options.force) return _cache;

  const resolvedCwd = resolve(cwd || process.cwd());

  const container = {
    type: detectContainerType(),
    hostname: process.env.HOSTNAME || process.env.REPL_ID || 'unknown',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const toolNames = ['git', 'node', 'npm', 'codex', 'claude'];
  const flagOnlyTools = ['rg', 'replit', 'gh'];
  const tools = {};

  for (const name of toolNames) {
    tools[name] = probeToolAvailability(name);
  }
  for (const name of flagOnlyTools) {
    const path = safeExec(`which ${name}`);
    tools[name] = { available: Boolean(path) };
  }

  const secrets = scanSecrets();
  const replitTools = scanReplitTools();
  const replit = scanReplit(resolvedCwd);
  const claudeCode = scanClaudeCode(resolvedCwd);
  const dualBrain = scanDualBrain(resolvedCwd);

  const report = {
    scannedAt: Date.now(),
    ttl,
    container,
    tools,
    secrets,
    replitTools,
    replit,
    claudeCode,
    dualBrain,
  };

  _cache = report;
  _cacheTime = Date.now();
  return report;
}

export function formatEnvironment(report) {
  const { container, tools, secrets, replitTools, replit, dualBrain } = report;

  const nodeShort = container.nodeVersion.replace(/^v/, '').split('.')[0];
  const containerLabel = container.type === 'replit'
    ? 'Replit'
    : container.type.charAt(0).toUpperCase() + container.type.slice(1);

  const lines = [];

  lines.push(`Environment: ${containerLabel} (node ${nodeShort}.x)`);

  const toolEntries = [];
  for (const [name, info] of Object.entries(tools)) {
    if (info.available) toolEntries.push(`${name} ✓`);
  }
  if (toolEntries.length) lines.push(`Tools: ${toolEntries.join('  ')}`);

  const secretMap = {
    OPENAI_API_KEY: 'OpenAI',
    ANTHROPIC_API_KEY: 'Anthropic',
    NPM_TOKEN: 'npm',
    GITHUB_TOKEN: 'GitHub',
    DATABASE_URL: 'PostgreSQL',
    REPLIT_DB_URL: 'KV',
  };
  const secretEntries = [];
  for (const [key, label] of Object.entries(secretMap)) {
    if (secrets[key]) secretEntries.push(`${label} ✓`);
  }
  if (secretEntries.length) lines.push(`Secrets: ${secretEntries.join('  ')}`);

  const platformParts = [];
  if (replit.hasDatabase) platformParts.push('PostgreSQL ✓');
  if (replit.hasKV) platformParts.push('KV ✓');
  if (replit.hasObjectStorage) platformParts.push('ObjectStorage ✓');
  if (replit.hasAuth) platformParts.push('Auth ✓');
  if (replit.hasDeployments) platformParts.push('Deployments ✓');
  if (platformParts.length) lines.push(`Platform: ${platformParts.join('  ')}`);

  if (replitTools.installed) {
    const ver = replitTools.version ? `v${replitTools.version}` : 'installed';
    const caps = replitTools.capabilities.join(', ');
    lines.push(`replit-tools: ${ver}${caps ? ` (${caps})` : ''}`);
  }

  const dbFlag = dualBrain.hasLedger ? ', ledger ✓' : '';
  const docsFlag = dualBrain.livingDocsInit ? 'living docs ✓' : 'living docs ✗';
  lines.push(`dual-brain: v${dualBrain.version} (${docsFlag}${dbFlag})`);

  return lines.join('\n');
}

export function getCapabilitySummary(report) {
  const caps = [];

  if (report.container.type !== 'unknown') {
    caps.push(`${report.container.type}-container`);
  }

  if (report.replit.hasDatabase) caps.push('postgresql');
  if (report.replit.hasKV) caps.push('replit-kv');
  if (report.replit.hasObjectStorage) caps.push('object-storage');
  if (report.replit.hasAuth) caps.push('replit-auth');
  if (report.replit.hasDeployments) caps.push('replit-deployments');

  if (report.tools.codex?.available) caps.push('codex-cli');
  if (report.tools.claude?.available) caps.push('claude-cli');
  if (report.tools.git?.available) caps.push('git');
  if (report.tools.gh?.available) caps.push('github-cli');
  if (report.tools.rg?.available) caps.push('ripgrep');

  if (report.secrets.OPENAI_API_KEY) caps.push('openai-key');
  if (report.secrets.ANTHROPIC_API_KEY) caps.push('anthropic-key');

  if (report.replitTools.installed) {
    for (const c of report.replitTools.capabilities) {
      caps.push(`replit-tools-${c}`);
    }
  }

  if (report.claudeCode.mcpConfigured) caps.push('mcp-configured');
  if (report.claudeCode.hooksDir) caps.push('claude-hooks');

  if (report.dualBrain.hasLedger) caps.push('dual-brain-ledger');
  if (report.dualBrain.hasFailureMemory) caps.push('dual-brain-failure-memory');
  if (report.dualBrain.livingDocsInit) caps.push('dual-brain-living-docs');

  return caps;
}

export function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}
