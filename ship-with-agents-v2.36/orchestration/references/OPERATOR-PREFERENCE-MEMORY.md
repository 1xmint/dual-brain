# Operator Preference Memory

Use this when user/operator preferences should become durable system truth
instead of dying in one chat.

## Core Truth

The user's voice should not live only in chat history when it affects repeated
launch, routing, review, or model behavior.

If the user says something like:

- "Super chats should default to Opus 4.6 high"
- "Manager and head stay in GPT/Codex desktop"
- "Do not jump to premium without asking"
- "My terminal is already rooted correctly, so stop prepending Set-Location"
- "Just give me the bare claude command block"

and that preference is meant to last beyond the current turn, write it into:

- `orchestration/OPERATOR-PREFERENCES.md`

## Read Order

Before recommending or emitting a launch command, use this order:

1. explicit slice or handoff override for this exact work
2. `orchestration/OPERATOR-PREFERENCES.md`
3. `orchestration/MODEL-CONFIG.md`
4. `orchestration/RUNTIME-MODEL-GATE.md`

Do not skip from generic prompt defaults straight to a launch command when
user-specific truth already exists.

## Preference Promotion Rule

Promote a user statement into operator preference memory when it is:

- about repeated model choice
- about repeated effort posture
- about which surface owns a role
- about premium escalation policy
- about role baselines such as head, manager, super, agent, or brainstorm
- about repeated workflow friction such as approval loops, relay style, or how
  much back-and-forth is acceptable before lanes should proceed on their own
- about repeated launch-environment truth such as terminal root, cwd
  assumptions, shell boilerplate, or command compactness

Do not promote:

- one-off experimental launches
- task-specific exceptions that belong in a slice or packet
- vague preferences that were never confirmed

## Temporary Override Rule

If the user says:

- "Use Opus for everything tonight"
- "For this phase, keep all review lanes premium"

record it as a temporary override with scope and expiry instead of silently
rewriting the permanent baseline.

## Launch Rule

When a role emits a launch command:

- it should state whether the command came from operator preference memory,
  model config, or a temporary override
- if there is drift, it should name the drift explicitly
- if operator preference memory already resolves cwd/root truth, do not add
  shell boilerplate by habit just because it feels safer

## Onboarding Rule

If repeated launch/setup friction shows that operator truth is still too thin:

- run `orchestration/references/PREFERENCE-ONBOARDING-RULE.md`
- save the resolved setup truth before emitting another launch recommendation
- treat the saved preference as live truth immediately

## No-Assumption Rule

If the file does not answer the question:

- say so
- fall back to `orchestration/MODEL-CONFIG.md`
- do not pretend the preference was remembered


