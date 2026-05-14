# Operator Preferences

Use this file in `_agent-system-local/` for durable buyer/operator truth that
should outrank generic package defaults.

This is where the customer's voice should live when it affects repeated launch,
review, or routing behavior.

Examples:

- "Super chats should default to Opus 4.6 high."
- "Head and review lanes live in Codex app, not terminal."
- "Do not use premium models without asking first."
- "Execution lanes default to Sonnet high unless security/auth work justifies more."

## Rule

- If the preference is durable, record it here.
- If it is only for the current session or phase, record it under
  `Temporary overrides`.
- If it is just a one-off launch exception, keep it in the slice, packet, or
  handoff instead of pretending it is a new default.

## Role Baselines

- Head baseline:
- Review lane baseline:
- Super baseline:
- Agent baseline:
- Worker baseline:
- Brainstorm baseline:

## Surface Truth

- Primary strategy/review surface:
- Primary coordination surface:
- Primary execution surface:
- Primary brainstorm surface:

## Budget And Escalation Truth

- Premium escalation permission:
- "Ask first" models:
- Cheapest acceptable execution default:

## Workflow Truth

- Default collaboration posture:
- Relay preference:
- Steering preference:
- After-go rule:
- Non-courier rule:
- Momentum preference:

## Support Truth

- Support posture:
- Explanation depth:
- Reassurance preference:
- Jargon tolerance:
- Wants optional learning callouts:
- Confidence state:
- Visualization preference:
- Doctor note preference:

## Temporary Overrides

- Override:
- Scope:
- Expires when:

## Notes

- Update this file when the user says a repeated preference out loud.
- Read this before reading `MODEL-CONFIG.md` when choosing launch defaults.
- Read this before choosing whether to use shipping, guided, or teaching
  support posture.
