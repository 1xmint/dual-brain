# Install Modes

This package supports three honest install modes.

Pick the lightest one that fits your real workflow.

If you want the safest product path, do not assemble these by hand first.
Use:

- `../bootstrap/bootstrap-lightweight.ps1`
- `../bootstrap/bootstrap-orchestration.ps1`
- `../bootstrap/agent-system-doctor.ps1`

## Mode 1: Simple In-Place Install

Best when:

- the repo is new
- the workflow is still lightweight
- you are not expecting frequent package upgrades yet

Shape:

- copy the files you need into the repo
- keep using repo-local docs and simple task packets

Tradeoff:

- easiest start
- least upgrade-safe if you later mix runtime state into package folders

## Mode 2: Safe Upgrade Install

Best when:

- you expect to upgrade the package over time
- you want to keep logs, checkpoints, and local tuning safe
- the project is becoming long-lived

Shape:

- `_agent-system/` = replaceable package layer
- `_agent-system-local/` = buyer-specific config
- `_agent-system-runtime/` = live state such as slices, reviews, checkpoints,
  logs, and archives
- `CHANGELOG.md` + `MIGRATIONS.md` = release-memory and adoption guide

This is the recommended long-term mode.

## Mode 3: Advanced Customized Install

Best when:

- you already know exactly which pieces you want to keep or override
- you are adapting the system to your own deeper workflow
- you want custom prompt behavior without losing easy vendor upgrades

Shape:

- keep the vendor layer mostly intact
- keep local overrides separate
- keep runtime state separate
- record what you changed in `ENABLED-MODULES.md` and your local notes

## Decision Rule

If you are unsure:

1. start with Mode 1
2. move to Mode 2 before the system becomes important enough that you
   would hate losing logs or checkpoints
3. use Mode 3 only after you understand the package well
4. read `CHANGELOG.md` and `MIGRATIONS.md` before any version upgrade

## Strong Recommendation

If the buyer is using:

- orchestration
- long-lived workstreams
- checkpoints
- multi-phase storage
- repeated package upgrades

then Mode 2 is the safest default.

It is also the default shape created by the orchestration bootstrap script.
