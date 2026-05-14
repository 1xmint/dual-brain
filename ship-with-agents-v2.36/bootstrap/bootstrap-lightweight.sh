#!/usr/bin/env sh
set -eu

TARGET_REPO="${1:-}"
if [ -z "$TARGET_REPO" ]; then
  echo "usage: sh bootstrap/bootstrap-lightweight.sh <repo-path>"
  exit 1
fi

PACKAGE_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TARGET_ROOT="$(CDPATH= cd -- "$TARGET_REPO" && pwd)"

write_if_missing() {
  src="$1"
  dest="$2"
  if [ -f "$dest" ]; then
    echo "skip existing: $dest"
    return
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "wrote: $dest"
}

write_text_if_missing() {
  dest="$1"
  text="$2"
  if [ -f "$dest" ]; then
    echo "skip existing: $dest"
    return
  fi
  mkdir -p "$(dirname "$dest")"
  printf "%s" "$text" > "$dest"
  echo "wrote: $dest"
}

mkdir -p "$TARGET_ROOT/_agent-system-local/starters"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/checkpoints"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/logs"

write_if_missing "$PACKAGE_ROOT/templates/AGENTS.md" "$TARGET_ROOT/AGENTS.md"
write_if_missing "$PACKAGE_ROOT/templates/CLAUDE.md" "$TARGET_ROOT/CLAUDE.md"
write_if_missing "$PACKAGE_ROOT/templates/task-packet.md" "$TARGET_ROOT/_agent-system-local/starters/task-packet.md"
write_if_missing "$PACKAGE_ROOT/templates/work-chat-handoff.md" "$TARGET_ROOT/_agent-system-local/starters/work-chat-handoff.md"
write_if_missing "$PACKAGE_ROOT/templates/chat-migration-packet.md" "$TARGET_ROOT/_agent-system-local/starters/chat-migration-packet.md"
write_if_missing "$PACKAGE_ROOT/templates/LOCAL-QUIRKS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-QUIRKS.md"
write_if_missing "$PACKAGE_ROOT/templates/LOCAL-LESSONS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-LESSONS.md"
write_if_missing "$PACKAGE_ROOT/templates/LOCAL-WINS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-WINS.md"
write_if_missing "$PACKAGE_ROOT/templates/OPERATOR-PREFERENCES.md" "$TARGET_ROOT/_agent-system-local/OPERATOR-PREFERENCES.md"

write_text_if_missing "$TARGET_ROOT/_agent-system-local/INSTALL-CONFIG.md" "# Install Config

## Install Mode

- Install mode: simple-in-place

## Folder Truth

- Vendor layer path: [not installed in lightweight mode]
- Local layer path: \`_agent-system-local/\`
- Runtime layer path: \`_agent-system-runtime/\`

## Runtime Paths

- Active workstreams index: [not required in lightweight mode]
- Checkpoints directory: \`_agent-system-runtime/checkpoints/\`
- Logs directory: \`_agent-system-runtime/logs/\`
- Archive directory: [optional later]

## Naming Truth

- Uses phase tags?: [yes / no]
- Phase style: [p1/p2, w1/w2, day0/day1, custom]
- Stable lane key style: [default \`head-<N>\`, \`super-<N>-<slug>\`,
  \`agent-<N>-<workstream>\`, \`doctor-<N>-<slug>\`, \`brainstorm-<N>-<slug>\`]
- Continuation tokens: [default \`--run<N>\` / \`--recover<N>\` or custom]

## Model / Control Truth

- Can this runtime show current model directly?: [yes / no / sometimes]
- Can helpers be pinned to a different runtime reliably?: [yes / no / unknown]
- Exact-control path: [manual terminal launch / direct helper acceptable]

## Notes

- Lightweight bootstrap created local and runtime folders early so you can grow
  into safer upgrades later without moving everything twice.
"

write_text_if_missing "$TARGET_ROOT/_agent-system-local/ENABLED-MODULES.md" "# Enabled Modules

## Core Mode

- Lightweight lane enabled?: yes
- Full orchestration enabled?: no
- True dual-brain audited mode enabled?: no

## Optional Gates And Systems

- Active chat map enabled?: no
- Context-load gate enabled?: no
- Spawn-decision gate enabled?: no
- Self-improvement loop enabled?: yes
- System improvement lane enabled?: yes
- Phase-and-storage system enabled?: no
- Runtime separation enabled?: yes

## Tooling Modes

- Primary execution tool: [Claude Code / Codex / Cursor / Windsurf / other]
- Second review brain enabled?: [yes / no]
- Local model helper enabled?: [yes / no]

## Notes

- Lightweight bootstrap installs the smallest durable starter shape.
- Graduate to orchestration only when simple task-packet transport stops being enough.
"

echo
echo "Lightweight bootstrap complete: $TARGET_ROOT"
echo "Next recommended reads: START-HERE.md, AGENT-WORKFLOW-GUIDE.md, PLATFORM-SETUP.md, FIRST-WEEK-PLAYBOOK.md"
echo "Then run: sh bootstrap/agent-system-doctor.sh <repo-path>"
