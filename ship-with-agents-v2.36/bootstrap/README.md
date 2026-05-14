# Bootstrap And Doctor

These scripts are the shortest path to a cleaner install.

Use them when you want the package to feel more like a product and less like a
pile of docs to copy by hand.

## The Intended Order

1. Read `../CHOOSE-YOUR-SETUP.md`.
2. Run one bootstrap script.
3. Run the doctor.
4. Read `../FIRST-WEEK-PLAYBOOK.md`.
5. Only then start customizing.

## Scripts

### Lightweight bootstrap

Creates a lightweight starter layout in an existing repo:

- `AGENTS.md`
- `_agent-system-local/`
- `_agent-system-runtime/`
- starter task/handoff/migration templates under local
- starter local config files
- starter operator-preference memory file

PowerShell:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-lightweight.ps1 -TargetRepo <repo-path>
```

Shell:

```text
sh bootstrap/bootstrap-lightweight.sh <repo-path>
```

### Orchestration bootstrap

Creates a full upgrade-safe layout:

- `_agent-system/`
- `_agent-system-local/`
- `_agent-system-runtime/`
- `.claude/agents/`
- `.claude/commands/`
- starter runtime workstream index

PowerShell:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-orchestration.ps1 -TargetRepo <repo-path>
```

Shell:

```text
sh bootstrap/bootstrap-orchestration.sh <repo-path>
```

### Doctor

Checks whether the install looks healthy.

It warns about:

- missing `AGENTS.md`
- missing vendor/local/runtime folders
- runtime-looking state living in the vendor layer
- missing Claude agent definitions in orchestration installs
- missing local config files
- missing operator preference memory
- missing manager review surfaces in orchestration installs

PowerShell:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/agent-system-doctor.ps1 -TargetRepo <repo-path>
```

Shell:

```text
sh bootstrap/agent-system-doctor.sh <repo-path>
```

## What These Scripts Are Not

- not a package manager
- not a one-click deploy tool
- not a replacement for reading the key docs

They just remove the dumbest setup friction so the buyer starts from a healthy
shape.

After the scripts run, `../FIRST-WEEK-PLAYBOOK.md` is the best next read if
you want to know what a healthy first week and healthy long-term usage look
like.
