# Checkpoints Directory

One file per active workstream. Each file is overwritten on every gate pass.
Any model (Claude or GPT) can read these to pick up a workstream cleanly.

File naming: `<workstream-slug>.md`
Examples:
  - auth-integration.md
  - api-v2-migration.md
  - billing-refactor.md

Keep the filename stable across rotations and crash recovery.

Recommended naming split:

- lane key = `agent-12-cache-fix`
- current session = `agent-12-cache-fix--run2`
- checkpoint filename = `cache-fix.md`

Do not copy the continuation token into the checkpoint filename.

Checkpoint rule:

- slice doc = plan and review truth
- checkpoint = execution truth

Do not try to turn checkpoints into giant planning packets.

For long-lived projects:

- put phase inside the file
- keep the checkpoint slug stable
- archive completed closeouts elsewhere by phase instead of renaming the
  checkpoint itself

For long-running or higher-assurance work, pair the checkpoint with:

- `_agent-system-runtime/checkpoint-events/<workstream-slug>.md` for append-only
  gate history
- `_agent-system-runtime/closeouts/<workstream-slug>.md` for final closeout
  truth

Pattern:

- slice doc = planning and review truth
- checkpoint = latest execution truth
- checkpoint event log = major transition history
- closeout packet = final closure truth

Checkpoint continuity fields matter too.

Meaningful checkpoints should carry:

- `Last verified at`
- `Freshness window`
- `Terminal status`
- `Pickup confidence`
- `Resume risk`
- `Lane state if stopping now`

Those fields are what make a future resume honest instead of optimistic.

See TEMPLATE.md for the checkpoint format.
