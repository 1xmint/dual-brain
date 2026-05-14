# Runtime Separation

Use this guide if you want the system to survive upgrades cleanly.

## Why Separate Runtime State

Live files are not the same thing as replaceable package files.

Runtime state changes constantly:

- active workstreams
- checkpoints
- checkpoint event logs
- closeout packets
- logs
- archives
- closeout notes
- routed workflow updates

Package files should be replaceable without destroying that state.

## Recommended Runtime Structure

Use:

- `_agent-system-runtime/ACTIVE-WORKSTREAMS.md`
- `_agent-system-runtime/slices/`
- `_agent-system-runtime/reviews/`
- `_agent-system-runtime/checkpoints/`
- `_agent-system-runtime/checkpoint-events/`
- `_agent-system-runtime/closeouts/`
- `_agent-system-runtime/logs/`
- `_agent-system-runtime/archive/`
- `_agent-system-runtime/updates/`

Keep the shipped copies in `_agent-system/` as starter/reference
material, but treat runtime as the real home for live operating state.

## Recommended Local Structure

Use:

- `_agent-system-local/INSTALL-CONFIG.md`
- `_agent-system-local/ENABLED-MODULES.md`
- `_agent-system-local/LOCAL-QUIRKS.md`
- `_agent-system-local/LOCAL-LESSONS.md`
- `_agent-system-local/LOCAL-WINS.md`

Optional local files can include:

- local model defaults
- environment or tooling quirks
- path overrides
- stronger review posture notes
- team-specific escalation rules
- buyer-specific self-improvement that should survive package upgrades

## Path Truth

If you separate runtime from vendor files, tell the chats explicitly in
local config.

Do not assume they will infer it.

## Migration Path

If you already have live state inside `_agent-system/`:

1. create `_agent-system-runtime/`
2. move live:
   - `ACTIVE-WORKSTREAMS.md`
   - `slices/`
   - `reviews/`
   - `checkpoints/`
   - `checkpoint-events/`
   - `closeouts/`
   - `logs/`
   - archive material
   - `updates/`
3. leave templates and durable shipped prompts in `_agent-system/`
4. add `_agent-system-local/INSTALL-CONFIG.md`
5. update your launch instructions so new chats read the local path
   truth first

## What The Public Package Ships

The package ships starter versions of:

- `ACTIVE-WORKSTREAMS.md`
- slice templates
- review templates
- checkpoint templates
- log templates

Those are starter/reference files.

For upgrade-safe setups, the buyer should treat the runtime copies as
the live source of truth.
