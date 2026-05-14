# Upgrade Guide

Use this when replacing an older copy of the package with a newer one.

The most important rule:

- do not let replaceable package files share a folder with your live
  logs, checkpoints, and local tuning unless you are willing to merge
  carefully by hand

## The Three-Layer Model

For long-term safe upgrades, separate your setup into three layers:

### 1. Vendor layer

Replaceable package files from this zip.

Example:

- `_agent-system/`

This is what you update when a new package version ships.

### 2. Local layer

Your project-specific settings and overrides.

Example:

- `_agent-system-local/`

Put here:

- `INSTALL-CONFIG.md`
- `ENABLED-MODULES.md`
- `LOCAL-QUIRKS.md`
- `LOCAL-LESSONS.md`
- `LOCAL-WINS.md`
- your actual model choices
- path overrides
- custom operating notes
- any prompt overrides you do not want a package update to overwrite

### 3. Runtime layer

Live work state generated while operating the system.

Example:

- `_agent-system-runtime/`

Put here:

- active workstream index
- slices
- review memos
- checkpoints
- checkpoint event logs
- closeout packets
- logs
- archives
- phase closeouts

## Safe Upgrade Path

If you want the safest long-term setup:

1. Keep the shipped package files in `_agent-system/`
2. Keep buyer-specific config in `_agent-system-local/`
3. Keep live state in `_agent-system-runtime/`
4. Replace only `_agent-system/` when upgrading
5. Leave `_agent-system-local/` and `_agent-system-runtime/` alone
6. Read `CHANGELOG.md` and `MIGRATIONS.md` before deciding what to adopt

## Quick Upgrade Path

If your setup is still small and you have not separated layers yet:

1. back up your repo first
2. compare the new package to your current files
3. copy in only the docs and prompts you actually want to update
4. do not blindly overwrite logs, checkpoints, or active indexes

This is workable for small repos, but it does not scale as cleanly.

## Recommended Folder Layout

```text
repo-root/
  AGENTS.md
  _agent-system/                # replaceable package layer
  _agent-system-local/          # buyer/project-specific config
    INSTALL-CONFIG.md
    ENABLED-MODULES.md
    LOCAL-LESSONS.md
    LOCAL-WINS.md
  _agent-system-runtime/        # live state
    ACTIVE-WORKSTREAMS.md
    slices/
    reviews/
    checkpoints/
    checkpoint-events/
    closeouts/
    logs/
    archive/
```

## What A New Zip Should Replace

Safe default:

- replace `_agent-system/`

Do not overwrite by default:

- `_agent-system-local/`
- `_agent-system-runtime/`
- live slice docs
- review memos
- repo-level docs the buyer already customized unless they intentionally
  want the new template version

## What If The Buyer Already Mixed Everything Together

That is common early on.

Best recovery path:

1. create `_agent-system-local/`
2. create `_agent-system-runtime/`
3. move:
   - slices
   - reviews
   - logs
   - checkpoints
   - active-workstreams index
   - archives
   into runtime
4. move:
   - local config
   - path rules
   - model choices
   into local
5. keep replaceable package files in `_agent-system/`

Do this before the next upgrade if possible.

## What The System Can And Cannot Know

The package should not pretend it can magically detect every buyer's
storage layout.

The robust way to make the system "know" is to give it a local config
file.

Use:

- `_agent-system-local/INSTALL-CONFIG.md`
- `_agent-system-local/ENABLED-MODULES.md`
- `_agent-system-local/LOCAL-QUIRKS.md`
- `_agent-system-local/LOCAL-LESSONS.md`
- `_agent-system-local/LOCAL-WINS.md`

That file should say:

- where runtime files live
- where logs live
- where checkpoints live
- where archives live
- whether the repo uses phase tags
- whether the buyer separated vendor/local/runtime layers

## Upgrade-Safe Truth

A buyer should be able to:

- drag in a new package version
- replace the vendor layer
- keep local tuning
- keep live work history
- keep buyer-specific self-improvement
- adopt only selected workflow changes when desired

That only becomes robust when those concerns live in different folders.
