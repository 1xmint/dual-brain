// command-risk.mjs — context-aware shell risk evaluation for dual-brain hooks.

const GENERATED_PATH_RE = /^(?:\.?\/)?(?:dist|build|coverage|out|tmp|temp|\.cache|\.next(?:\/cache)?|\.nuxt|\.svelte-kit|\.vite|\.turbo|node_modules\/\.cache)(?:\/|$)/;
const LOW_VALUE_FILE_RE = /(?:^|\/)(?:.*\.log|.*\.tmp|.*\.bak|.*\.map|\.DS_Store)$/;
const SOURCE_PATH_RE = /^(?:\.?\/)?(?:src|app|pages|components|lib|server|api|routes|db|database|migrations|prisma|auth|security|infra|scripts|hooks|bin|\.github|\.claude|\.dualbrain|\.dual-brain)(?:\/|$)/;
const CONFIG_PATH_RE = /^(?:\.?\/)?(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|\.env(?:\..*)?|.*(?:secret|credential|token|key|oauth|auth).*\.(?:json|ya?ml|toml|ini))(?:$|\/)/i;

const HARD_DENY_RULES = [
  { label: 'disk overwrite', re: /\bdd\b[\s\S]*\bof=\/dev\// },
  { label: 'filesystem format', re: /\bmkfs(?:\.[a-z0-9]+)?\b/ },
  { label: 'secure shred', re: /\bshred\b/ },
  { label: 'world-writable permissions', re: /\bchmod\s+(?:-[^\s]*R[^\s]*\s+)?777\b/ },
  { label: 'recursive ownership change', re: /\bchown\s+-[^\s]*R\b/ },
  { label: 'hard git reset', re: /\bgit\s+reset\s+--hard\b/ },
  { label: 'forced git clean', re: /\bgit\s+clean\s+-[^\s]*f/ },
  { label: 'discard git checkout', re: /\bgit\s+checkout\s+--\b/ },
  { label: 'discard git restore', re: /\bgit\s+restore\s+(?:\.|:[/\\]|--source=|--staged\s+\.)/ },
  { label: 'force push', re: /\bgit\s+push\b[\s\S]*--force(?:-with-lease)?\b/ },
  { label: 'branch delete', re: /\bgit\s+branch\s+-D\b/ },
  { label: 'history rewrite', re: /\bgit\s+rebase\b/ },
  { label: 'production deploy', re: /\b(vercel|netlify|fly|railway|wrangler|firebase|supabase|sst)\s+(?:deploy|release)\b/ },
  { label: 'database migration', re: /\b(prisma|drizzle|knex|sequelize|typeorm|rails)\b[\s\S]*\b(migrate|db:drop|db:reset|rollback)\b/ },
  { label: 'package publish', re: /\b(npm|pnpm|yarn)\s+publish\b/ },
  { label: 'secret or env mutation', re: /(?:^|\s)(?:cat|printf|echo|tee|sed\s+-i|perl\s+-pi)\b[\s\S]*(?:>|>>|\s)\s*(?:\.env|.*(?:secret|credential|token|key|oauth|auth).*\.(?:json|ya?ml|toml|ini))/i },
];

const WRITE_BASH_RE = /\brm\b|\bmv\b|\bcp\b|\bmkdir\b|\btouch\b|\bchmod\b|\bchown\b|\bdd\b|\binstall\b|\btruncate\b|\btee\b|\bsed\s+-i\b|\bawk\s+-i\b|>>|(?<![><])>(?![>=])/;

function normalizePathToken(token) {
  return String(token || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\.\//, '');
}

function commandTokens(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(command))) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function rmAnalysis(command) {
  const tokens = commandTokens(command);
  const rmIndex = tokens.findIndex(t => t === 'rm');
  if (rmIndex < 0) return null;

  const args = tokens.slice(rmIndex + 1);
  const flags = args.filter(t => /^-/.test(t)).join('');
  const paths = args.filter(t => !/^-/.test(t)).map(normalizePathToken);
  const recursive = /r|R/.test(flags);
  const force = /f/.test(flags);

  return { recursive, force, paths };
}

function pathCategory(path) {
  const p = normalizePathToken(path);
  if (!p || p === '.' || p === '..' || p === '/' || p === '~' || p.startsWith('../') || p.startsWith('/')) return 'broad';
  if (SOURCE_PATH_RE.test(p) || CONFIG_PATH_RE.test(p)) return 'source';
  if (GENERATED_PATH_RE.test(p) || LOW_VALUE_FILE_RE.test(p)) return 'generated';
  if (/[*?[\]{}]/.test(p)) return 'glob';
  return 'unknown';
}

function assessRm(command) {
  const analysis = rmAnalysis(command);
  if (!analysis) return null;

  if (analysis.paths.length === 0) {
    return { decision: 'ask', severity: 'medium', reason: 'rm without explicit path', category: 'filesystem-delete' };
  }

  const categories = analysis.paths.map(pathCategory);
  if (categories.includes('broad')) {
    return { decision: 'deny', severity: 'critical', reason: 'delete targets broad or absolute path', category: 'filesystem-delete', paths: analysis.paths };
  }
  if (categories.includes('source')) {
    return { decision: 'ask', severity: 'high', reason: 'delete touches source, config, auth, or system files', category: 'filesystem-delete', paths: analysis.paths };
  }
  if (analysis.recursive && categories.every(c => c === 'generated')) {
    return { decision: 'allow', severity: 'low', reason: 'cleanup is scoped to generated/cache output', category: 'generated-cleanup', paths: analysis.paths };
  }
  if (!analysis.recursive && categories.every(c => c === 'generated')) {
    return { decision: 'allow', severity: 'low', reason: 'delete is scoped to low-value generated files', category: 'generated-cleanup', paths: analysis.paths };
  }
  if (analysis.recursive || analysis.force || categories.includes('glob')) {
    return { decision: 'ask', severity: 'medium', reason: 'delete has recursive/force/glob behavior outside known generated paths', category: 'filesystem-delete', paths: analysis.paths };
  }
  return { decision: 'ask', severity: 'medium', reason: 'delete target is not recognized as generated output', category: 'filesystem-delete', paths: analysis.paths };
}

export function isBashWriteIntent(command) {
  return WRITE_BASH_RE.test(command);
}

export function assessCommandRisk(command, context = {}) {
  const raw = String(command || '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return { decision: 'allow', severity: 'low', reason: 'empty command', category: 'none' };
  }

  for (const rule of HARD_DENY_RULES) {
    if (rule.re.test(trimmed)) {
      return { decision: 'deny', severity: 'critical', reason: rule.label, category: 'hard-stop' };
    }
  }

  if (/\bfind\b[\s\S]*\s-delete\b/.test(trimmed)) {
    return { decision: 'ask', severity: 'high', reason: 'find -delete depends on search scope', category: 'filesystem-delete' };
  }

  const rm = assessRm(trimmed);
  if (rm) return rm;

  if (/\btruncate\s+-s\s*0\b/.test(trimmed)) {
    return { decision: 'ask', severity: 'high', reason: 'truncate clears file contents', category: 'filesystem-write' };
  }

  if (/>>|(?<![><])>(?![>=])/.test(trimmed) && CONFIG_PATH_RE.test(trimmed)) {
    return { decision: 'ask', severity: 'high', reason: 'redirect writes to config, auth, secret, or env-like file', category: 'protected-write' };
  }

  if (context?.head === true && isBashWriteIntent(trimmed)) {
    return { decision: 'deny', severity: 'medium', reason: 'HEAD write-intent command must dispatch work', category: 'head-write' };
  }

  if (isBashWriteIntent(trimmed)) {
    return { decision: 'allow', severity: 'medium', reason: 'write-intent command allowed for scoped work agent', category: 'agent-write' };
  }

  return { decision: 'allow', severity: 'low', reason: 'read-only or diagnostic command', category: 'read-only' };
}
