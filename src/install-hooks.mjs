/**
 * install-hooks.mjs — Merge dual-brain PreToolUse hooks into .claude/settings.json.
 *
 * Exported function: installHooks(cwd)
 * Returns: { installed: string[], skipped: string[] }
 */

import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PKG_ROOT   = join(__dirname, '..');

// The hook commands we want present in .claude/settings.json PreToolUse
const HEAD_GUARD_CMD   = 'node .claude/hooks/head-guard.mjs';
const ENFORCE_TIER_CMD = 'node .claude/hooks/enforce-tier.mjs';

const DESIRED_HOOKS = [
  { matcher: 'Edit',         command: HEAD_GUARD_CMD },
  { matcher: 'Write',        command: HEAD_GUARD_CMD },
  { matcher: 'NotebookEdit', command: HEAD_GUARD_CMD },
  { matcher: 'Bash',         command: HEAD_GUARD_CMD },
  { matcher: 'Agent',        command: ENFORCE_TIER_CMD },
];

/**
 * Install dual-brain enforcement hooks into a project's .claude/settings.json.
 *
 * @param {string} cwd - Project root directory (where .claude/ should live)
 * @returns {{ installed: string[], skipped: string[] }}
 */
export function installHooks(cwd) {
  const claudeDir    = join(cwd, '.claude');
  const hooksDir     = join(claudeDir, 'hooks');
  const settingsPath = join(claudeDir, 'settings.json');

  const installed = [];
  const skipped   = [];

  // Ensure directories exist
  mkdirSync(hooksDir, { recursive: true });

  // Copy hook files from package into project's .claude/hooks/
  const filesToCopy = [
    { name: 'head-guard.mjs',   exec: true },
    { name: 'enforce-tier.mjs', exec: false },
  ];

  for (const { name, exec } of filesToCopy) {
    const src = join(PKG_ROOT, 'hooks', name);
    const dst = join(hooksDir, name);
    if (existsSync(src)) {
      cpSync(src, dst);
      if (exec) {
        try { chmodSync(dst, 0o755); } catch {}
      }
      installed.push(`hooks/${name}`);
    }
  }

  // Read existing settings (or start fresh)
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    // File doesn't exist or is malformed — start empty
  }

  // Ensure hooks.PreToolUse array exists
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  const preToolUse = settings.hooks.PreToolUse;

  // Merge: for each desired hook, add only if command is not already registered for that matcher
  for (const { matcher, command } of DESIRED_HOOKS) {
    const alreadyPresent = preToolUse.some(entry =>
      entry.matcher === matcher &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some(h => h.command === command)
    );

    if (alreadyPresent) {
      skipped.push(`PreToolUse[${matcher}]`);
    } else {
      preToolUse.push({
        matcher,
        hooks: [{ type: 'command', command }],
      });
      installed.push(`PreToolUse[${matcher}]`);
    }
  }

  // Write back merged settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  return { installed, skipped };
}
