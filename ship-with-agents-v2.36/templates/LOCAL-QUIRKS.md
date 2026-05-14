# Local Quirks

Use this file in `_agent-system-local/` for environment-specific quirks,
limitations, and operational gotchas that should survive package upgrades.

Good examples:

- a terminal or shell quirk
- a desktop-app continuity quirk
- a local model limitation
- a repo-specific formatting or encoding issue
- a workflow caveat tied to your own setup

## Rule

- If the quirk is specific to your setup, keep it here.
- If it repeats enough to look broadly reusable, consider promoting it later
  into vendor/package truth or your own fork.

## Suggested Entry Shape

- Surface:
- Symptom:
- Trigger:
- Safe workaround:
- Whether this is local-only or promotion-candidate:
