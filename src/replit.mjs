/**
 * replit.mjs — Replit platform integration for dual-brain.
 *
 * Treats replit-tools as infrastructure and adds intelligence on top.
 * Uses only Node built-ins. Never reads or returns secret values.
 *
 * Sections:
 *   1. Discovery  — read-only inspection of environment and replit-tools
 *   2. Planning   — compute .replit config changes, no side effects
 *   3. Apply      — mutating; low-risk changes only in v1
 *   4. Formatters — pretty-print integration reports
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  renameSync,
  createReadStream,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeJson(filePath) {
  const raw = safeRead(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

/** Returns the replit-tools root directory for a given workspace cwd, or null. */
function findReplitToolsDir(cwd) {
  const candidates = [
    join(cwd, '.replit-tools'),
    '/home/runner/workspace/.replit-tools',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return resolve(c);
  }
  return null;
}

// ─── Section 1: Discovery ─────────────────────────────────────────────────────

/**
 * Detect the Replit runtime environment from env vars.
 * @param {string} [cwd]
 * @returns {{ isReplit, replId, replSlug, replOwner, replUrl, nixChannel, containerType, uptimeSeconds }}
 */
export function detectReplitEnvironment(cwd = process.cwd()) {
  const env = process.env;
  const isReplit = Boolean(env.REPL_ID || env.REPL_SLUG);

  let uptimeSeconds = null;
  try {
    const raw = readFileSync('/proc/uptime', 'utf8');
    uptimeSeconds = Math.floor(parseFloat(raw.split(' ')[0]));
  } catch { /* not available */ }

  // Container type from env signals
  let containerType = 'local';
  if (isReplit) containerType = 'replit';
  else if (env.CODESPACES) containerType = 'codespace';
  else if (env.CI || env.GITHUB_ACTIONS || env.GITLAB_CI) containerType = 'ci';

  // nixChannel from .replit file if available
  let nixChannel = env.NIX_CHANNEL || null;
  const replitFile = join(resolve(cwd), '.replit');
  if (!nixChannel && existsSync(replitFile)) {
    const content = safeRead(replitFile) || '';
    const m = content.match(/channel\s*=\s*["']?([^\s"'\n]+)["']?/);
    if (m) nixChannel = m[1];
  }

  return {
    isReplit,
    replId: env.REPL_ID || null,
    replSlug: env.REPL_SLUG || null,
    replOwner: env.REPL_OWNER || null,
    replUrl: env.REPL_URL || (env.REPL_SLUG ? `https://replit.com/@${env.REPL_OWNER || 'unknown'}/${env.REPL_SLUG}` : null),
    nixChannel,
    containerType,
    uptimeSeconds,
  };
}

/**
 * Read and parse the .replit config file.
 * Uses simple line-by-line parsing — no TOML dependency.
 * @param {string} [cwd]
 * @returns {{ raw, run, onBoot, expertMode, hidden, modules, nix, deployment, hasRun, hasOnBoot, hasExpertMode }}
 */
export function inspectReplitConfig(cwd = process.cwd()) {
  const replitPath = join(resolve(cwd), '.replit');
  const raw = safeRead(replitPath);

  if (!raw) {
    return {
      raw: null, run: null, onBoot: null, expertMode: null,
      hidden: [], modules: [], nix: {}, deployment: {},
      hasRun: false, hasOnBoot: false, hasExpertMode: false,
    };
  }

  const lines = raw.split('\n');
  let run = null;
  let onBoot = null;
  let expertMode = null;
  const hidden = [];
  const modules = [];
  const nix = {};
  const deployment = {};
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Section headers: [nix], [agent], [deployment]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    // Key = value (handle quoted and unquoted)
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value = kvMatch[2].trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (currentSection === 'nix') {
      nix[key] = value;
    } else if (currentSection === 'deployment') {
      deployment[key] = value;
    } else if (currentSection === 'agent') {
      if (key === 'expertMode') {
        expertMode = value === 'true' || value === '1';
      }
    } else if (!currentSection) {
      // Top-level keys
      if (key === 'run') run = value;
      else if (key === 'onBoot') onBoot = value;
      else if (key === 'modules') {
        // modules = ["nodejs-20"] style
        const items = value.replace(/[\[\]"']/g, '').split(',').map(s => s.trim()).filter(Boolean);
        modules.push(...items);
      } else if (key === 'hidden') {
        const items = value.replace(/[\[\]"']/g, '').split(',').map(s => s.trim()).filter(Boolean);
        hidden.push(...items);
      }
    }
  }

  return {
    raw,
    run,
    onBoot,
    expertMode,
    hidden,
    modules,
    nix,
    deployment,
    hasRun: run !== null,
    hasOnBoot: onBoot !== null,
    hasExpertMode: expertMode !== null,
  };
}

/**
 * Inventory what replit-tools provides in the current workspace.
 * @param {string} [cwd]
 * @returns {object} Structured capability report
 */
export function inspectReplitTools(cwd = process.cwd()) {
  const toolsDir = findReplitToolsDir(resolve(cwd));

  if (!toolsDir) {
    return {
      installed: false,
      version: null,
      toolsDir: null,
      sessionArchive: { exists: false, sessionCount: 0, latestTimestamp: null },
      persistentHomes: { claude: false, codex: false },
      authRefresh: { available: false },
      config: null,
      codexPlugins: { count: 0 },
      shellSnapshots: { available: false, count: 0 },
      mcpAuthCache: { available: false, entries: 0 },
    };
  }

  // Version
  let version = null;
  const versionFile = join(toolsDir, '.version');
  if (existsSync(versionFile)) {
    version = (safeRead(versionFile) || '').trim() || null;
  }
  if (!version) {
    const pkg = safeJson(join(toolsDir, 'package.json'));
    if (pkg?.version) version = pkg.version;
  }

  // Session archive: .replit-tools/.session-archive/claude/
  const archiveBase = join(toolsDir, '.session-archive', 'claude');
  let sessionCount = 0;
  let latestTimestamp = null;
  if (existsSync(archiveBase)) {
    // Recursively count all .jsonl files under the archive tree
    function countJsonl(dir) {
      for (const entry of safeReaddir(dir)) {
        const full = join(dir, entry);
        const st = safeStat(full);
        if (!st) continue;
        if (st.isDirectory()) {
          countJsonl(full);
        } else if (entry.endsWith('.jsonl')) {
          sessionCount++;
          const ts = st.mtimeMs;
          if (!latestTimestamp || ts > latestTimestamp) latestTimestamp = ts;
        }
      }
    }
    countJsonl(archiveBase);
  }

  // Persistent homes
  const claudePersistent = join(toolsDir, '.claude-persistent');
  const codexPersistent = join(toolsDir, '.codex-persistent');

  // Auth refresh
  const authRefreshScript = join(toolsDir, 'scripts', 'claude-auth-refresh.sh');
  const authRefreshAvailable = existsSync(authRefreshScript);

  // Config
  const config = safeJson(join(toolsDir, 'config.json'));

  // Codex plugins
  const pluginsDir = join(codexPersistent, '.tmp', 'plugins', 'plugins');
  const pluginCount = existsSync(pluginsDir) ? safeReaddir(pluginsDir).length : 0;

  // Shell snapshots
  const shellSnapshotsDir = join(claudePersistent, 'shell-snapshots');
  const shellSnapshotFiles = existsSync(shellSnapshotsDir)
    ? safeReaddir(shellSnapshotsDir).filter(f => f.endsWith('.sh'))
    : [];

  // MCP auth cache
  const mcpCacheFile = join(claudePersistent, 'mcp-needs-auth-cache.json');
  const mcpCache = safeJson(mcpCacheFile);
  const mcpEntries = mcpCache ? Object.keys(mcpCache).length : 0;

  return {
    installed: true,
    version,
    toolsDir,
    sessionArchive: {
      exists: existsSync(archiveBase),
      sessionCount,
      latestTimestamp,
    },
    persistentHomes: {
      claude: existsSync(claudePersistent),
      codex: existsSync(codexPersistent),
    },
    authRefresh: {
      available: authRefreshAvailable,
      scriptPath: authRefreshAvailable ? authRefreshScript : null,
    },
    config,
    codexPlugins: { count: pluginCount },
    shellSnapshots: {
      available: existsSync(shellSnapshotsDir),
      count: shellSnapshotFiles.length,
    },
    mcpAuthCache: {
      available: existsSync(mcpCacheFile),
      entries: mcpEntries,
    },
  };
}

/**
 * Check whether a named environment variable is set (never returns its value).
 * @param {string} name
 * @returns {boolean}
 */
export function hasSecret(name) {
  return process.env[name] !== undefined && process.env[name] !== '';
}

// System env var patterns to exclude from listSecretNames
const SYSTEM_PREFIXES = [
  'npm_', 'NODE_', 'PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'TERM',
  'LANG', 'LC_', 'PWD', 'OLDPWD', 'SHLVL', 'HOSTNAME', 'MAIL',
  'XDG_', 'DBUS_', 'DISPLAY', 'COLORTERM', 'LESS', 'PAGER', 'EDITOR',
  'MANPATH', 'INFOPATH', 'LS_COLORS', 'PS1', 'PS2', 'IFS', '_',
  'REPL_', 'REPLIT_', 'NIX_', 'NIXPKGS_', 'LOCALE_', 'JAVA_',
];

const KNOWN_SECRET_NAMES = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DATABASE_URL', 'REPLIT_DB_URL',
  'GITHUB_TOKEN', 'GITHUB_API_TOKEN', 'NPM_TOKEN', 'NPM_AUTH_TOKEN',
  'STRIPE_SECRET_KEY', 'STRIPE_API_KEY', 'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS',
  'FIREBASE_TOKEN', 'SUPABASE_KEY', 'SUPABASE_URL', 'POSTGRES_URL',
  'MONGODB_URI', 'REDIS_URL', 'SENDGRID_API_KEY', 'TWILIO_AUTH_TOKEN',
  'SLACK_BOT_TOKEN', 'DISCORD_TOKEN', 'VERCEL_TOKEN', 'CLOUDFLARE_API_TOKEN',
];

function looksLikeSystemVar(name) {
  for (const prefix of SYSTEM_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Return names of set secrets/credentials. Never returns values.
 * @returns {string[]}
 */
export function listSecretNames() {
  const result = new Set();

  // Check known secrets first
  for (const name of KNOWN_SECRET_NAMES) {
    if (hasSecret(name)) result.add(name);
  }

  // Find other non-system env vars that look like secrets
  for (const name of Object.keys(process.env)) {
    if (result.has(name)) continue;
    if (looksLikeSystemVar(name)) continue;
    // Heuristic: name contains KEY, TOKEN, SECRET, PASSWORD, PASS, URL, CREDENTIAL
    if (/KEY|TOKEN|SECRET|PASS(WORD)?|CREDENTIAL|SALT|PRIVATE/i.test(name)) {
      if (hasSecret(name)) result.add(name);
    }
  }

  return [...result].sort();
}

/**
 * Read the session archive from replit-tools directly.
 * @param {string} [cwd]
 * @returns {{ sessions: Array<{id, path, size, lastModified}>, totalSessions, latestTimestamp }}
 */
export function getSessionArchive(cwd = process.cwd()) {
  const toolsDir = findReplitToolsDir(resolve(cwd));
  if (!toolsDir) {
    return { sessions: [], totalSessions: 0, latestTimestamp: null };
  }

  const archiveBase = join(toolsDir, '.session-archive', 'claude');
  if (!existsSync(archiveBase)) {
    return { sessions: [], totalSessions: 0, latestTimestamp: null };
  }

  const sessions = [];

  function scanDir(dir) {
    for (const entry of safeReaddir(dir)) {
      const full = join(dir, entry);
      const st = safeStat(full);
      if (!st) continue;
      if (st.isDirectory()) {
        scanDir(full);
      } else if (entry.endsWith('.jsonl')) {
        sessions.push({
          id: entry.replace(/\.jsonl$/, ''),
          path: full,
          size: st.size,
          lastModified: new Date(st.mtimeMs).toISOString(),
        });
      }
    }
  }

  scanDir(archiveBase);
  sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

  const latestTimestamp = sessions.length > 0 ? sessions[0].lastModified : null;

  return {
    sessions,
    totalSessions: sessions.length,
    latestTimestamp,
  };
}

/**
 * Get auth status from the claude-auth-refresh.sh script.
 * @param {string} [cwd]
 * @returns {{ available, tokenStatus, expiresAt, needsRefresh }}
 */
export function getAuthStatus(cwd = process.cwd()) {
  const toolsDir = findReplitToolsDir(resolve(cwd));
  if (!toolsDir) return { available: false };

  const script = join(toolsDir, 'scripts', 'claude-auth-refresh.sh');
  if (!existsSync(script)) return { available: false };

  try {
    const result = spawnSync('bash', [script, '--status'], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0 && !result.stdout) {
      return { available: true, tokenStatus: 'unknown', expiresAt: null, needsRefresh: false };
    }

    const output = (result.stdout || '') + (result.stderr || '');

    // Parse common status patterns from the script output
    let tokenStatus = 'unknown';
    let expiresAt = null;
    let needsRefresh = false;

    if (/valid|ok|authenticated/i.test(output)) tokenStatus = 'valid';
    else if (/expired|invalid|missing/i.test(output)) tokenStatus = 'expired';
    else if (/refresh/i.test(output)) { tokenStatus = 'expiring'; needsRefresh = true; }

    const expiresMatch = output.match(/expires[:\s]+([^\n]+)/i);
    if (expiresMatch) expiresAt = expiresMatch[1].trim();

    if (/need.*refresh|should.*refresh/i.test(output)) needsRefresh = true;

    return { available: true, tokenStatus, expiresAt, needsRefresh };
  } catch {
    return { available: true, tokenStatus: 'unknown', expiresAt: null, needsRefresh: false };
  }
}

/**
 * Read replit-tools config.json settings that dual-brain should respect.
 * @param {string} [cwd]
 * @returns {{ recentWindowHours, persistenceDays, mirror, raw } | null}
 */
export function getReplitToolsConfig(cwd = process.cwd()) {
  const toolsDir = findReplitToolsDir(resolve(cwd));
  if (!toolsDir) return null;

  const config = safeJson(join(toolsDir, 'config.json'));
  if (!config) return null;

  return {
    recentWindowHours: config.recentWindowHours ?? 48,
    persistenceDays: config.persistenceDays ?? 365,
    mirror: config.mirror ?? null,
    raw: config,
  };
}

// ─── Section 2: Planning ──────────────────────────────────────────────────────

const DUAL_BRAIN_HIDDEN = ['.dualbrain', '.replit-tools', '.dual-brain', 'node_modules'];

/**
 * Plan .replit config changes needed to reach a desired state.
 * No side effects — returns a plan object only.
 * @param {object} [desired]
 * @param {string} [cwd]
 * @returns {{ changes, summary, riskLevel, preserves }}
 */
export function planReplitConfig(desired = {}, cwd = process.cwd()) {
  const current = inspectReplitConfig(resolve(cwd));
  const changes = [];
  const preserves = [];

  // Track what we're keeping
  if (Object.keys(current.nix).length) preserves.push('existing nix config');
  if (current.modules.length) preserves.push(`modules: ${current.modules.join(', ')}`);
  if (Object.keys(current.deployment).length) preserves.push('existing deployment config');

  // 1. Remove expertMode = true if set (suppresses random shell noise)
  const wantExpertMode = desired.expertMode ?? false;
  if (current.expertMode === true && !wantExpertMode) {
    changes.push({
      key: 'expertMode',
      action: 'remove',
      reason: 'prevents random shell spawning in Replit agent',
      risk: 'medium',
    });
  }

  // 2. hidden array — add dual-brain entries that are missing
  const currentHidden = new Set(current.hidden);
  const desiredHidden = desired.hidden ?? DUAL_BRAIN_HIDDEN;
  const missingHidden = desiredHidden.filter(h => !currentHidden.has(h));
  if (missingHidden.length) {
    const merged = [...new Set([...current.hidden, ...desiredHidden])];
    changes.push({
      key: 'hidden',
      action: 'add',
      value: merged,
      adds: missingHidden,
      risk: 'low',
    });
  }

  // 3. onBoot — ensure dual-brain is mentioned; if missing entirely, suggest adding
  if (desired.onBoot !== undefined) {
    if (current.onBoot !== desired.onBoot) {
      changes.push({
        key: 'onBoot',
        action: 'set',
        value: desired.onBoot,
        previous: current.onBoot,
        risk: 'low',
      });
    }
  } else if (!current.hasOnBoot) {
    // Suggest a sensible default
    const suggestedOnBoot = 'source .replit-tools/scripts/setup-claude-code.sh 2>/dev/null || true';
    changes.push({
      key: 'onBoot',
      action: 'set',
      value: suggestedOnBoot,
      reason: 'ensure replit-tools auth persistence on container restart',
      risk: 'low',
    });
  }

  // 4. run — remove if it's a trivial/noop command; preserve if it looks like a dev server
  if (current.hasRun && desired.removeRun !== false) {
    const runVal = current.run || '';
    const isTrivial = /^(echo|true|:|#|dual-brain|npx.*dual-brain)/i.test(runVal.trim());
    if (isTrivial) {
      changes.push({
        key: 'run',
        action: 'remove',
        reason: 'vibe coders use `dual-brain go`, not the Run button — trivial command removed',
        previous: runVal,
        risk: 'medium',
      });
    } else {
      preserves.push(`run command: "${runVal.slice(0, 60)}${runVal.length > 60 ? '…' : ''}"`);
    }
  }

  // Compute overall risk
  const risks = changes.map(c => c.risk);
  let riskLevel = 'low';
  if (risks.includes('high')) riskLevel = 'high';
  else if (risks.includes('medium')) riskLevel = 'medium';

  // Summary
  const actionSummary = changes.map(c => {
    if (c.action === 'remove') return `remove ${c.key}`;
    if (c.action === 'add') return `add ${c.adds?.join(', ')} to ${c.key}`;
    if (c.action === 'set') return `set ${c.key}`;
    return `${c.action} ${c.key}`;
  });

  const summary = changes.length === 0
    ? 'No changes needed — .replit is already optimal for dual-brain.'
    : `${changes.length} change${changes.length > 1 ? 's' : ''}: ${actionSummary.join('; ')}.`;

  return { changes, summary, riskLevel, preserves };
}

// ─── Section 3: Apply ─────────────────────────────────────────────────────────

/**
 * Apply a planned change set to the .replit file.
 * Only applies low-risk changes by default (skipMedium = false applies medium too).
 * Preserves original file structure — patches in-place where possible.
 *
 * @param {Array} changes — from planReplitConfig
 * @param {string} cwd
 * @param {{ skipMedium?: boolean }} options
 * @returns {string[]} list of applied change keys
 */
function applyReplitChanges(changes, cwd, { skipMedium = false } = {}) {
  if (!changes.length) return [];

  const replitPath = join(resolve(cwd), '.replit');
  const raw = safeRead(replitPath) || '';
  let lines = raw.split('\n');
  const applied = [];

  for (const change of changes) {
    if (change.risk === 'high') continue;
    if (change.risk === 'medium' && skipMedium) continue;

    if (change.key === 'expertMode' && change.action === 'remove') {
      // Remove the [agent] section lines containing expertMode
      const newLines = [];
      let inAgentSection = false;
      let removedExpertMode = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '[agent]') {
          inAgentSection = true;
          // Only include if there are other keys besides expertMode
          // We'll add back if needed after scanning
          newLines.push(line);
          continue;
        }
        if (inAgentSection && trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inAgentSection = false;
        }
        if (inAgentSection && /^expertMode\s*=/.test(trimmed)) {
          removedExpertMode = true;
          continue; // skip this line
        }
        newLines.push(line);
      }

      if (removedExpertMode) {
        // Clean up empty [agent] section
        lines = cleanEmptySection(newLines, 'agent');
        applied.push('expertMode');
      }
    }

    else if (change.key === 'hidden' && change.action === 'add') {
      const valueStr = formatTomlArray(change.value);
      const replaced = replaceOrInsertTopLevel(lines, 'hidden', valueStr);
      lines = replaced;
      applied.push('hidden');
    }

    else if (change.key === 'onBoot' && change.action === 'set') {
      const valueStr = `"${change.value}"`;
      const replaced = replaceOrInsertTopLevel(lines, 'onBoot', valueStr);
      lines = replaced;
      applied.push('onBoot');
    }

    else if (change.key === 'run' && change.action === 'remove') {
      lines = lines.filter(l => !/^run\s*=/.test(l.trim()));
      applied.push('run');
    }
  }

  if (applied.length) {
    const newContent = lines.join('\n');
    const tmp = replitPath + '.tmp.' + process.pid;
    try {
      writeFileSync(tmp, newContent);
      renameSync(tmp, replitPath);
    } catch (err) {
      try { require('node:fs').unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
  }

  return applied;
}

function formatTomlArray(items) {
  return '[' + items.map(i => `"${i}"`).join(', ') + ']';
}

function replaceOrInsertTopLevel(lines, key, valueStr) {
  const regex = new RegExp(`^${key}\\s*=`);
  let found = false;
  const result = lines.map(line => {
    if (regex.test(line.trim())) {
      found = true;
      return `${key} = ${valueStr}`;
    }
    return line;
  });
  if (!found) {
    // Insert before first section header or at end
    const firstSection = result.findIndex(l => /^\s*\[/.test(l));
    if (firstSection > 0) {
      result.splice(firstSection, 0, `${key} = ${valueStr}`);
    } else {
      result.push(`${key} = ${valueStr}`);
    }
  }
  return result;
}

function cleanEmptySection(lines, sectionName) {
  const header = `[${sectionName}]`;
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === header) {
      // Look ahead: if next non-blank line is another section or EOF, skip the header
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const nextIsSectionOrEnd = j >= lines.length || /^\[/.test(lines[j].trim());
      if (nextIsSectionOrEnd) {
        // Remove blank lines between removed header and next section
        while (result.length && !result[result.length - 1].trim()) result.pop();
        i = j;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result;
}

/**
 * Main integration function: detect, inspect, plan, optionally apply.
 * @param {{ dryRun?: boolean, cwd?: string, skipMedium?: boolean }} options
 * @returns {{ environment, replitTools, config, plan, applied, report }}
 */
export function initReplitIntegration({ dryRun = false, cwd = process.cwd() } = {}) {
  const resolvedCwd = resolve(cwd);

  const environment = detectReplitEnvironment(resolvedCwd);
  const config = inspectReplitConfig(resolvedCwd);
  const replitTools = inspectReplitTools(resolvedCwd);
  const toolsConfig = getReplitToolsConfig(resolvedCwd);

  // Plan optimal config
  const plan = planReplitConfig({}, resolvedCwd);

  let applied = [];
  if (!dryRun && plan.changes.length) {
    try {
      applied = applyReplitChanges(plan.changes, resolvedCwd);
    } catch (err) {
      applied = [];
    }
  }

  const report = {
    environment,
    replitTools: {
      ...replitTools,
      toolsConfig,
    },
    config,
    plan,
    applied,
    dryRun,
  };

  return report;
}

/**
 * Thin escape hatch to run the replit CLI.
 * @param {string[]} args
 * @param {{ timeout?: number }} options
 * @returns {{ ok, stdout, stderr }}
 */
export function runReplitCli(args, options = {}) {
  const timeout = options.timeout ?? 30000;
  try {
    const whichResult = spawnSync('which', ['replit'], { encoding: 'utf8' });
    if (whichResult.status !== 0) {
      return { ok: false, stdout: '', stderr: 'replit CLI not found in PATH' };
    }

    const result = spawnSync('replit', args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err.message };
  }
}

// ─── Section 4: Formatters ────────────────────────────────────────────────────

/**
 * Pretty-print the integration report for TUI/dashboard display.
 * @param {object} report — from initReplitIntegration
 * @returns {string}
 */
export function formatReplitReport(report) {
  const { environment, replitTools, config, plan, applied, dryRun } = report;
  const lines = [];

  // Environment
  const envLabel = environment.isReplit ? 'Replit' : environment.containerType;
  const uptimeLabel = environment.uptimeSeconds != null
    ? ` (up ${Math.floor(environment.uptimeSeconds / 60)}m)`
    : '';
  lines.push(`Environment: ${envLabel}${uptimeLabel}`);
  if (environment.nixChannel) lines.push(`  nix: ${environment.nixChannel}`);

  // replit-tools
  if (replitTools.installed) {
    const ver = replitTools.version ? `v${replitTools.version}` : 'installed';
    lines.push(`replit-tools: ${ver}`);

    const { sessionArchive, codexPlugins, shellSnapshots, mcpAuthCache } = replitTools;
    if (sessionArchive.exists) {
      const tsLabel = sessionArchive.latestTimestamp
        ? ` latest: ${new Date(sessionArchive.latestTimestamp).toLocaleDateString()}`
        : '';
      lines.push(`  sessions: ${sessionArchive.sessionCount}${tsLabel}`);
    }
    if (codexPlugins.count > 0) lines.push(`  codex plugins: ${codexPlugins.count}`);
    if (shellSnapshots.count > 0) lines.push(`  shell snapshots: ${shellSnapshots.count}`);
    if (mcpAuthCache.entries > 0) lines.push(`  mcp cached: ${mcpAuthCache.entries} servers`);
    if (replitTools.toolsConfig) {
      lines.push(`  session window: ${replitTools.toolsConfig.recentWindowHours}h`);
    }
  } else {
    lines.push('replit-tools: not found');
  }

  // Current .replit
  lines.push('.replit:');
  if (config.raw === null) {
    lines.push('  (not found)');
  } else {
    if (config.hasExpertMode) lines.push(`  expertMode: ${config.expertMode}`);
    if (config.hidden.length) lines.push(`  hidden: ${config.hidden.join(', ')}`);
    if (config.hasOnBoot) lines.push(`  onBoot: ${(config.onBoot || '').slice(0, 60)}…`);
    if (config.modules.length) lines.push(`  modules: ${config.modules.join(', ')}`);
  }

  // Plan
  if (plan.changes.length === 0) {
    lines.push('Config: already optimal');
  } else {
    lines.push(`Plan (${dryRun ? 'dry-run' : plan.riskLevel} risk):`);
    for (const c of plan.changes) {
      const prefix = `  [${c.risk}]`;
      if (c.action === 'remove') lines.push(`${prefix} remove ${c.key} — ${c.reason || ''}`);
      else if (c.action === 'add') lines.push(`${prefix} add to ${c.key}: ${c.adds?.join(', ')}`);
      else if (c.action === 'set') lines.push(`${prefix} set ${c.key}`);
    }
    if (plan.preserves.length) lines.push(`  preserves: ${plan.preserves.join('; ')}`);
  }

  // Applied
  if (!dryRun && applied.length > 0) {
    lines.push(`Applied: ${applied.join(', ')}`);
  } else if (!dryRun && plan.changes.length > 0) {
    lines.push('Applied: none (errors or all changes were medium/high risk)');
  }

  return lines.join('\n');
}

// ─── Section 5: Plugin Inventory ──────────────────────────────────────────────

/** In-process cache for plugin inventory (plugins don't change during a session). */
let _pluginInventoryCache = null;

/**
 * Parse YAML-style frontmatter from a SKILL.md string.
 * Returns { name, description, metadata } — all optional.
 * @param {string} content
 * @returns {{ name?: string, description?: string, metadata?: object }}
 */
function _parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const fm = content.slice(3, end).trim();
  const result = {};
  for (const line of fm.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'name') result.name = val;
    else if (key === 'description') result.description = val;
  }
  return result;
}

/**
 * Scan the Codex plugin directory and return a structured inventory.
 * Reads each plugin's skills subdirectories for SKILL.md (name, description, capabilities).
 * Result is cached after the first call.
 *
 * @param {string} [cwd]
 * @returns {{ plugins: Array<{ id, name, description, capabilities, skillNames, path }>, count }}
 */
export function getPluginInventory(cwd = process.cwd()) {
  if (_pluginInventoryCache) return _pluginInventoryCache;

  const toolsDir = findReplitToolsDir(resolve(cwd));
  if (!toolsDir) {
    _pluginInventoryCache = { plugins: [], count: 0 };
    return _pluginInventoryCache;
  }

  const pluginsDir = join(toolsDir, '.codex-persistent', '.tmp', 'plugins', 'plugins');
  if (!existsSync(pluginsDir)) {
    _pluginInventoryCache = { plugins: [], count: 0 };
    return _pluginInventoryCache;
  }

  const plugins = [];

  for (const pluginId of safeReaddir(pluginsDir)) {
    const pluginPath = join(pluginsDir, pluginId);
    const st = safeStat(pluginPath);
    if (!st || !st.isDirectory()) continue;

    const skillsDir = join(pluginPath, 'skills');
    const skillDirs = existsSync(skillsDir) ? safeReaddir(skillsDir) : [];

    let pluginName = pluginId;
    let pluginDescription = '';
    const capabilities = [];
    const skillNames = [];

    for (const skillDir of skillDirs) {
      const skillPath = join(skillsDir, skillDir);
      const skillSt = safeStat(skillPath);
      if (!skillSt || !skillSt.isDirectory()) continue;

      const skillMdPath = join(skillPath, 'SKILL.md');
      const skillContent = safeRead(skillMdPath);
      if (!skillContent) continue;

      const fm = _parseFrontmatter(skillContent);

      // Use the first skill's name/description as the plugin's primary identity
      if (fm.name && pluginName === pluginId) pluginName = fm.name;
      if (fm.description && !pluginDescription) pluginDescription = fm.description;

      // Collect all skill names as capabilities
      if (fm.name) {
        skillNames.push(fm.name);
        capabilities.push(fm.name);
      } else {
        skillNames.push(skillDir);
        capabilities.push(skillDir);
      }

      // Extract additional capabilities from description keywords
      if (fm.description) {
        // Pull out words in "Triggers: X, Y, Z" format if present
        const triggerMatch = fm.description.match(/[Tt]riggers?:\s*([^.]+)/);
        if (triggerMatch) {
          const triggers = triggerMatch[1].split(/[,;]+/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 30);
          capabilities.push(...triggers);
        }
      }
    }

    plugins.push({
      id: pluginId,
      name: pluginName,
      description: pluginDescription,
      capabilities: [...new Set(capabilities)],
      skillNames,
      path: pluginPath,
    });
  }

  _pluginInventoryCache = { plugins, count: plugins.length };
  return _pluginInventoryCache;
}

/**
 * Match plugins to a task description using keyword matching.
 * Returns plugins sorted by relevance score (descending).
 *
 * @param {string} taskDescription
 * @param {Array<{ id, name, description, capabilities, skillNames, path }>} [plugins]
 * @param {string} [cwd]
 * @returns {Array<{ plugin: object, relevance: number, reason: string }>}
 */
export function matchPluginsForTask(taskDescription, plugins, cwd = process.cwd()) {
  if (!taskDescription) return [];

  const inventory = plugins ?? getPluginInventory(cwd).plugins;
  if (!inventory || inventory.length === 0) return [];

  const desc = taskDescription.toLowerCase();
  const results = [];

  for (const plugin of inventory) {
    let score = 0;
    const reasons = [];

    // Check plugin id (e.g. "stripe" in "check stripe webhook") — highest weight
    const idLower = plugin.id.toLowerCase();
    if (desc.includes(idLower)) {
      score += 3;
      reasons.push(`plugin id "${plugin.id}" mentioned`);
    }

    // Check plugin name
    const nameLower = plugin.name.toLowerCase();
    if (nameLower !== idLower && desc.includes(nameLower)) {
      score += 2;
      reasons.push(`plugin name "${plugin.name}" mentioned`);
    }

    // Check description keywords (≥4 chars to avoid noise)
    if (plugin.description) {
      const descWords = plugin.description
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length >= 4);
      for (const word of descWords) {
        if (desc.includes(word)) {
          score += 1;
          reasons.push(`keyword "${word}"`);
          break; // one hit per description is enough
        }
      }
    }

    // Check skill names
    for (const skill of plugin.skillNames) {
      if (desc.includes(skill.toLowerCase())) {
        score += 2;
        reasons.push(`skill "${skill}" mentioned`);
        break;
      }
    }

    // Check capabilities
    for (const cap of plugin.capabilities) {
      if (cap.length >= 4 && desc.includes(cap.toLowerCase())) {
        score += 1;
        reasons.push(`capability "${cap}" matched`);
        break;
      }
    }

    if (score > 0) {
      results.push({
        plugin,
        relevance: score,
        reason: reasons.slice(0, 3).join('; '),
      });
    }
  }

  return results.sort((a, b) => b.relevance - a.relevance);
}

// ─── Section 6: Session Archive Search ────────────────────────────────────────

/**
 * Search the Claude session archive for keyword matches in user messages.
 * Reads session files line by line to avoid loading full files into memory.
 * Results are recency-weighted: today ×2, this week ×1.5, older ×1.
 *
 * @param {string} query
 * @param {{ limit?: number, days?: number }} [options]
 * @param {string} [cwd]
 * @returns {Promise<Array<{ sessionId, date, matchingMessage, relevance }>>}
 */
export async function searchSessionArchive(query, options = {}, cwd = process.cwd()) {
  const { limit = 5, days = 30 } = options;

  if (!query) return [];

  const toolsDir = findReplitToolsDir(resolve(cwd));
  if (!toolsDir) return [];

  const archiveBase = join(toolsDir, '.session-archive', 'claude');
  if (!existsSync(archiveBase)) return [];

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (queryTerms.length === 0) return [];

  const now = Date.now();
  const cutoffMs = now - days * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;

  // Collect JSONL session files (not history.jsonl which has different format)
  const sessionFiles = [];

  function collectJsonl(dir) {
    try {
      for (const entry of safeReaddir(dir)) {
        if (entry === 'history.jsonl') continue; // skip — different structure
        const full = join(dir, entry);
        const st = safeStat(full);
        if (!st) continue;
        if (st.isDirectory()) {
          collectJsonl(full);
        } else if (entry.endsWith('.jsonl')) {
          if (st.mtimeMs >= cutoffMs) {
            sessionFiles.push({ path: full, mtime: st.mtimeMs });
          }
        }
      }
    } catch { /* ignore unreadable dirs */ }
  }

  collectJsonl(archiveBase);

  if (sessionFiles.length === 0) return [];

  // Sort newest first so we hit the most relevant sessions early
  sessionFiles.sort((a, b) => b.mtime - a.mtime);

  const matches = [];

  for (const { path: filePath, mtime } of sessionFiles) {
    // Age-based recency weight
    const ageMs = now - mtime;
    const recency = ageMs < oneDayMs ? 2.0 : ageMs < oneWeekMs ? 1.5 : 1.0;

    // Derive sessionId from filename
    const sessionId = filePath.split('/').pop().replace(/\.jsonl$/, '');
    const date = new Date(mtime).toISOString().slice(0, 10);

    let fileMatched = false;

    await new Promise((resolveFn) => {
      try {
        const rl = createInterface({
          input: createReadStream(filePath, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });

        rl.on('line', (line) => {
          if (!line || fileMatched) return;
          try {
            const entry = JSON.parse(line);

            // Only look at user messages
            if (entry.type !== 'user') return;
            if (entry.isMeta) return; // skip meta/command-caveat lines

            const content = entry.message?.content;
            if (!content || typeof content !== 'string') return;
            if (content.length < 3) return;

            const contentLower = content.toLowerCase();
            let termScore = 0;

            for (const term of queryTerms) {
              if (contentLower.includes(term)) termScore++;
            }

            if (termScore === 0) return;

            const relevance = Math.round(termScore * recency * 10) / 10;
            const snippet = content.length > 120 ? content.slice(0, 120) + '…' : content;

            matches.push({ sessionId, date, matchingMessage: snippet, relevance });
            fileMatched = true; // one match per session file is enough for the index
          } catch { /* skip malformed lines */ }
        });

        rl.on('close', resolveFn);
        rl.on('error', resolveFn);
      } catch {
        resolveFn();
      }
    });

    // Early exit once we have plenty of candidates
    if (matches.length >= limit * 4) break;
  }

  // Sort by relevance descending, return top `limit`
  matches.sort((a, b) => b.relevance - a.relevance);
  return matches.slice(0, limit);
}
