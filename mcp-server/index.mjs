#!/usr/bin/env node
/**
 * mcp-server/index.mjs — MCP server for dual-brain routing engine.
 *
 * Exposes dual-brain capabilities as MCP tools via JSON-RPC 2.0 over stdin/stdout.
 * No external dependencies — uses only Node.js built-ins and the src/ modules.
 *
 * Tools:
 *   dual_brain_detect   — Classify a task (intent, risk, complexity, tier)
 *   dual_brain_decide   — Route a task (provider, model, tier, reason)
 *   dual_brain_status   — Provider health and budget overview
 *   dual_brain_remember — Save a routing preference
 *
 * Usage (standalone):
 *   node mcp-server/index.mjs
 *
 * MCP client config:
 *   {
 *     "mcpServers": {
 *       "dual-brain": {
 *         "command": "node",
 *         "args": ["node_modules/dual-brain/mcp-server/index.mjs"]
 *       }
 *     }
 *   }
 */

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

// ─── Tool definitions (JSON Schema) ──────────────────────────────────────────

const TOOLS = [
  {
    name: 'dual_brain_detect',
    description: 'Classify a task prompt into intent, risk, complexity, and routing tier. Returns classification data used by the dual-brain routing engine.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task description or prompt to classify.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of file paths involved in the task. Used for risk classification.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'dual_brain_decide',
    description: 'Detect a task and route it to the best provider and model. Returns provider, model, tier, explanation, and whether dual-brain review is recommended.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task description or prompt.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of file paths involved in the task.',
        },
        profile: {
          type: 'string',
          description: 'Optional profile mode override: "auto", "balanced", "cost-saver", or "quality-first".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'dual_brain_status',
    description: 'Get current provider health, routing scores, and session statistics. Shows which providers are healthy, degraded, or rate-limited.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'dual_brain_remember',
    description: 'Save a routing preference that persists across sessions. Examples: "prefer claude for architecture", "use cost-saver mode", "never dual-brain".',
    inputSchema: {
      type: 'object',
      properties: {
        preference: {
          type: 'string',
          description: 'The routing preference to remember in plain English.',
        },
      },
      required: ['preference'],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleDetect({ prompt, files = [] }) {
  const { detectTask } = await import(`${SRC}/detect.mjs`);
  const result = detectTask({ prompt, files });
  return {
    intent: result.intent,
    risk: result.risk,
    complexity: result.complexity,
    effort: result.effort,
    tier: result.tier,
    fileCount: result.fileCount,
    requiresWrite: result.requiresWrite,
    riskyFiles: result.riskyFiles,
    explanation: result.explanation,
  };
}

async function handleDecide({ prompt, files = [], profile: profileOverride }) {
  const { detectTask } = await import(`${SRC}/detect.mjs`);
  const { decideRoute } = await import(`${SRC}/decide.mjs`);
  const { loadProfile } = await import(`${SRC}/profile.mjs`);

  const cwd = process.cwd();
  let profile = loadProfile(cwd);

  // Apply profile override if requested
  if (profileOverride) {
    profile = { ...profile, mode: profileOverride, profile: profileOverride };
  }

  const detection = detectTask({ prompt, files });
  const decision = decideRoute({ profile, detection, cwd });

  return {
    provider: decision.provider,
    model: decision.model,
    effort: decision.effort,
    tier: decision.tier,
    dualBrain: decision.dualBrain,
    modes: decision.modes,
    sandbox: decision.sandbox,
    explanation: decision.explanation,
    detection: {
      intent: detection.intent,
      risk: detection.risk,
      complexity: detection.complexity,
    },
  };
}

async function handleStatus() {
  const { loadProfile, getAvailableProviders } = await import(`${SRC}/profile.mjs`);
  const { getHealth, getProviderScore, getSessionStats } = await import(`${SRC}/health.mjs`);

  const cwd = process.cwd();
  const profile = loadProfile(cwd);
  const health = getHealth(cwd);

  const providers = {};

  for (const prov of ['claude', 'openai']) {
    const cfg = profile?.providers?.[prov];
    if (!cfg) {
      providers[prov] = { enabled: false };
      continue;
    }

    // Get scores for each tier model
    const models = {
      search: prov === 'claude' ? 'haiku' : 'gpt-4.1-mini',
      execute: prov === 'claude' ? 'sonnet' : 'gpt-5.4',
      think: prov === 'claude' ? 'opus' : 'gpt-5.5',
    };

    const scores = {};
    const states = {};
    for (const [tier, modelClass] of Object.entries(models)) {
      scores[tier] = getProviderScore(prov, modelClass, cwd);
      const key = `${prov}:${modelClass}`;
      states[modelClass] = health.states[key] ?? { status: 'healthy' };
    }

    providers[prov] = {
      enabled: cfg.enabled ?? false,
      plan: cfg.plan ?? null,
      scores,
      states,
    };
  }

  const session = getSessionStats ? getSessionStats(cwd) : (health.session ?? null);

  return {
    providers,
    session,
    profile: {
      mode: profile?.mode || profile?.profile || 'auto',
      dualBrainEnabled: profile?.dual_brain_enabled !== false,
      preferences: (profile?.preferences || []).filter(p => p.enabled).map(p => p.text),
    },
  };
}

async function handleRemember({ preference }) {
  const { rememberPreference, getActivePreferences } = await import(`${SRC}/profile.mjs`);
  const cwd = process.cwd();
  rememberPreference(preference, { cwd });
  const all = getActivePreferences(cwd);
  return {
    saved: true,
    preference,
    preferences: all.map(p => p.text),
  };
}

// ─── JSON-RPC dispatcher ──────────────────────────────────────────────────────

async function dispatchTool(name, args) {
  switch (name) {
    case 'dual_brain_detect':  return handleDetect(args);
    case 'dual_brain_decide':  return handleDecide(args);
    case 'dual_brain_status':  return handleStatus();
    case 'dual_brain_remember': return handleRemember(args);
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
  }
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function respond(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function errorResponse(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return JSON.stringify({ jsonrpc: '2.0', id, error: err });
}

// ─── Request handlers ─────────────────────────────────────────────────────────

async function handleRequest(msg) {
  const { id, method, params } = msg;

  try {
    switch (method) {
      case 'initialize':
        return respond(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'dual-brain', version: '7.1.0' },
        });

      case 'initialized':
        // Notification (no id), no response needed
        return null;

      case 'tools/list':
        return respond(id, { tools: TOOLS });

      case 'tools/call': {
        const { name, arguments: args = {} } = params || {};
        if (!name) {
          return errorResponse(id, -32602, 'Missing tool name');
        }
        const result = await dispatchTool(name, args);
        return respond(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      }

      case 'ping':
        return respond(id, {});

      default:
        return errorResponse(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    const code = err.code ?? -32000;
    const message = err.message ?? 'Internal error';
    return errorResponse(id, code, message);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

// Track in-flight requests so we don't exit while work is pending
let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) return;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    process.stdout.write(errorResponse(null, -32700, 'Parse error') + '\n');
    return;
  }

  pending++;
  handleRequest(msg).then((response) => {
    if (response !== null) {
      process.stdout.write(response + '\n');
    }
  }).catch((err) => {
    process.stdout.write(errorResponse(msg?.id ?? null, -32000, err?.message ?? 'Internal error') + '\n');
  }).finally(() => {
    pending--;
    maybeExit();
  });
});

rl.on('close', () => {
  stdinClosed = true;
  maybeExit();
});
