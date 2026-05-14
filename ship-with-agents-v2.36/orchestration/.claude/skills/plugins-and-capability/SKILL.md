<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 977a4ea764c6827d0c3047714f3b5d187f4fb15cbc0fe01ab1aa1e57c8a33540 -->
<!-- canonical-sources:
  - PLUGIN-AWARENESS-GATE.md
  - PLUGIN-INVENTORY.md
  - PLUGIN-FIT-MATRIX.md
  - PLUGIN-OPTIONALITY-RULE.md
  - PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md
  - PLUGIN-PORTABILITY-GATE.md
  - CAPABILITY-FIRST-EXECUTION-RULE.md
  - CAPABILITY-AWARENESS-GATE.md
  - CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md
-->
---
name: plugins-and-capability
description: Plugin fit, capability-first execution, and install suggestion discipline. Use when installed or marketplace capabilities could materially change the workflow.
---

# Plugins And Capability

Use this skill when the buyer may be doing work the system can already do with
an installed or installable capability.

## Read first

1. `PLUGIN-AWARENESS-GATE.md`
2. `PLUGIN-INVENTORY.md`
3. `PLUGIN-FIT-MATRIX.md`

Then load as needed:

- `PLUGIN-OPTIONALITY-RULE.md`
- `PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md`
- `PLUGIN-PORTABILITY-GATE.md`
- `CAPABILITY-FIRST-EXECUTION-RULE.md`
- `CAPABILITY-AWARENESS-GATE.md`
- `CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md`

## Default loop

1. Verify what the current lane can already do.
2. Check installed plugins before requesting buyer transport work.
3. Suggest installation only when the capability materially improves the task.
4. Say clearly when the workflow remains portable without the plugin.

## Output shape

- `Capability available now:`
- `Plugin fit:`
- `Buyer labor avoided:`
- `Install suggestion:` only when justified

