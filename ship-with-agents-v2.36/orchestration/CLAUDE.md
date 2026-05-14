# CLAUDE.md

Claude Code runtime contract for this orchestration system.

## Core Operating Model

- Keep the hot path small.
- Keep live truth in files, not in chat memory.
- Prefer skills for conditional domain loading instead of eager branch fan-out.
- When external freshness or hidden risk matters, research it instead of
  pretending local certainty.
- Use `OUTPUT-MODES.md` for buyer-facing tails and keep steering separate from
  labor.

## Startup Order

1. Read `AGENTS.md`.
2. Read the current role card in `.claude/agents/`.
3. Read the smallest current truth artifact for the task.
4. Load one or more skills only when the task actually needs them.

## Skill Trigger Table

- If the issue is lane identity, revive/startup, ownership, or lane closeout,
  load `.claude/skills/lane-discipline/SKILL.md`.
- If the issue is unread completions, pickup state, or whether `done` should
  be enough, load `.claude/skills/continuity-pickup/SKILL.md`.
- If the issue is launch ambiguity, packet vs spawn vs injection, or transport
  shape, load `.claude/skills/launch-and-transport/SKILL.md`.
- If the issue is weak assumptions, routing guesses, or unlabeled inference,
  load `.claude/skills/truth-and-verification/SKILL.md`.
- If the issue is review density, second-brain shape, assurance, or manager
  purity, load `.claude/skills/review-topology/SKILL.md`.
- If the issue is buyer-facing posture, output tails, handholding, or delivery
  clarity, load `.claude/skills/buyer-support/SKILL.md`.
- If the issue is code review substance, missing edge cases, refactor safety,
  error handling, API shape, or commit boundary quality, load the relevant
  skill from `.claude/skills/code-review/SKILL.md`,
  `.claude/skills/test-design/SKILL.md`,
  `.claude/skills/refactoring-patterns/SKILL.md`,
  `.claude/skills/error-handling/SKILL.md`,
  `.claude/skills/api-design/SKILL.md`, or
  `.claude/skills/commit-hygiene/SKILL.md`.
- If the issue is execution-owner choice, state-plane coherence, or
  cross-workstream impact, load the relevant pair from
  `.claude/skills/execution-routing/SKILL.md`,
  `.claude/skills/state-plane/SKILL.md`, and
  `.claude/skills/system-impact/SKILL.md`.
- If the issue is external freshness, plugin/capability fit, runtime surface
  truth, model choice, or package mirror work, load the relevant skill from
  `.claude/skills/external-research/SKILL.md`,
  `.claude/skills/plugins-and-capability/SKILL.md`,
  `.claude/skills/surface-runtime/SKILL.md`,
  `.claude/skills/model-and-budget/SKILL.md`, or
  `.claude/skills/package-maintenance/SKILL.md`.
- If the issue is repo-scoped memory, durable lessons, or the user says
  `remember this`, `note that`, or asks what was learned before, load
  `.claude/skills/personal-memory/SKILL.md`.
- If the issue is a repo-specific implementation convention, repeated local
  correction, or reusable project pattern, also load
  `.claude/skills/patterns/SKILL.md`.
- If the question is which provider (Claude vs. Codex), cross-provider diversity, or quota advisory, also read `.claude/skills/provider-routing/SKILL.md`.
- If the question is which model tier a role should use by default, when to escalate to Opus, or how to invoke `/upgrade-model`, read `decisions/MODEL-DEFAULTS-PATTERN.md`.

## Commands

Prefer project commands for repeated work:

- `/sync-lane`
- `/read-inbox`
- `/resolve-identity`
- `/absorb-completions`
- `/assess-review-topology`
- `/resolve-budget-routing`
- `/log-turn-outcome`
- `/assess-observability`
- `/log-friction`
- `/capture-pattern`

## Long-Horizon Discipline

- Write state into files when files should remember it.
- Prefer merge, deletion, or retirement over another root rule when nearby
  doctrine already exists.
- Doctor improvements must remain net-zero or net-negative on rule/gate/
  protocol file count unless a higher-priority breakage justifies growth.
- Skills are a Claude-only acceleration layer. Canonical doctrine still lives in
  the root docs.
