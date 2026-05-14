# Operator Capabilities

Use this file in `_agent-system-local/` for durable capability truth that
should influence workflow recommendations.

This is where the customer's active optional surfaces should live when they are
real enough to matter repeatedly.

Examples:

- "I have Replit Core now."
- "I have access to a remote cloud host for long-running Claude Code lanes."
- "I have a paid deployment surface we should consider for demos."

## Rule

- Record durable capability availability here.
- If the capability is temporary, put it under `Temporary capability
  overrides`.
- If the capability should change how live lanes think, publish it through the
  update bus too.

## Active Capabilities

- Capability:
- Status:
- Best use:
- Avoid using for:

## Temporary Capability Overrides

- Capability:
- Scope:
- Expires when:

## Notes

- A capability being active does not make it the default answer to every task.
- Read this before acting like only the old surfaces exist.
