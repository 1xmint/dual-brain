/**
 * provider-enforcement.ts — provider-side policy envelopes.
 *
 * Claude has native hook enforcement in this workspace. Codex does not expose
 * the same hook layer, so dual-brain-owned Codex sessions must carry their
 * enforcement contract in the launch prompt and CLI policy flags.
 */

export interface ProviderEnvelopeOpts {
  provider: string;
  mode?: 'dispatch' | 'handoff' | 'resume';
  tier?: string;
  runId?: string;
  cwd?: string;
}

export function buildProviderEnvelope(prompt: string, opts: ProviderEnvelopeOpts): string {
  const provider = opts.provider === 'openai' ? 'codex' : opts.provider;
  const mode = opts.mode || 'dispatch';
  const tier = opts.tier || 'execute';
  const runId = opts.runId || `${mode}:${Date.now()}`;

  return [
    '<dual-brain-enforcement>',
    `provider: ${provider}`,
    `mode: ${mode}`,
    `tier: ${tier}`,
    `run_id: ${runId}`,
    opts.cwd ? `cwd: ${opts.cwd}` : null,
    '',
    'You are operating inside dual-brain. Follow this contract:',
    '- Do not orchestrate, re-route, spawn parallel agents, or change the plan.',
    '- Do only the task brief below. If the brief is missing, return status needs_brief.',
    '- Respect the assigned tier and provider role.',
    '- Do not touch auth, credentials, billing, secrets, or migrations unless the brief explicitly includes approval.',
    '- Before code changes finish, report files changed, tests run, edge cases, and blockers.',
    '- If a requested action conflicts with this envelope, stop and return status needs_approval.',
    '</dual-brain-enforcement>',
    '',
    prompt,
  ].filter(Boolean).join('\n');
}

export function codexPolicyArgs(mode: 'interactive' | 'exec' = 'interactive'): string[] {
  if (mode === 'exec') {
    return ['--sandbox', 'workspace-write', '--ask-for-approval', 'never', 'exec'];
  }
  return ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
}
