#!/usr/bin/env sh
set -eu

TARGET_REPO="${1:-}"
if [ -z "$TARGET_REPO" ]; then
  echo "usage: sh bootstrap/bootstrap-orchestration.sh <repo-path>"
  exit 1
fi

PACKAGE_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TARGET_ROOT="$(CDPATH= cd -- "$TARGET_REPO" && pwd)"

copy_if_missing() {
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

copy_tree_if_missing() {
  src_dir="$1"
  dest_dir="$2"
  find "$src_dir" -type f | while IFS= read -r src; do
    rel="${src#$src_dir/}"
    dest="$dest_dir/$rel"
    copy_if_missing "$src" "$dest"
  done
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

mkdir -p "$TARGET_ROOT/_agent-system"
mkdir -p "$TARGET_ROOT/_agent-system-local"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/slices"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/reviews"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/checkpoints"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/checkpoint-events"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/closeouts"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/health"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/observability"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/lanes"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/mail/inbox"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/logs"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/archive"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/updates/inbox"
mkdir -p "$TARGET_ROOT/_agent-system-runtime/workstreams"
mkdir -p "$TARGET_ROOT/.claude/agents"
mkdir -p "$TARGET_ROOT/.claude/commands"
mkdir -p "$TARGET_ROOT/.claude/rules"

copy_if_missing "$PACKAGE_ROOT/templates/AGENTS.md" "$TARGET_ROOT/AGENTS.md"
copy_if_missing "$PACKAGE_ROOT/templates/CLAUDE.md" "$TARGET_ROOT/CLAUDE.md"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration" "$TARGET_ROOT/_agent-system"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/.claude/agents" "$TARGET_ROOT/.claude/agents"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/.claude/commands" "$TARGET_ROOT/.claude/commands"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/.claude/rules" "$TARGET_ROOT/.claude/rules"
copy_if_missing "$PACKAGE_ROOT/orchestration/ACTIVE-WORKSTREAMS.md" "$TARGET_ROOT/_agent-system-runtime/ACTIVE-WORKSTREAMS.md"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/updates" "$TARGET_ROOT/_agent-system-runtime/updates"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/checkpoint-events" "$TARGET_ROOT/_agent-system-runtime/checkpoint-events"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/closeouts" "$TARGET_ROOT/_agent-system-runtime/closeouts"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/health" "$TARGET_ROOT/_agent-system-runtime/health"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/lanes" "$TARGET_ROOT/_agent-system-runtime/lanes"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/mail" "$TARGET_ROOT/_agent-system-runtime/mail"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/observability" "$TARGET_ROOT/_agent-system-runtime/observability"
copy_tree_if_missing "$PACKAGE_ROOT/orchestration/workstreams" "$TARGET_ROOT/_agent-system-runtime/workstreams"
copy_if_missing "$PACKAGE_ROOT/templates/LOCAL-QUIRKS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-QUIRKS.md"
copy_if_missing "$PACKAGE_ROOT/templates/LOCAL-LESSONS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-LESSONS.md"
copy_if_missing "$PACKAGE_ROOT/templates/LOCAL-WINS.md" "$TARGET_ROOT/_agent-system-local/LOCAL-WINS.md"
copy_if_missing "$PACKAGE_ROOT/templates/OPERATOR-PREFERENCES.md" "$TARGET_ROOT/_agent-system-local/OPERATOR-PREFERENCES.md"

write_text_if_missing "$TARGET_ROOT/_agent-system-local/INSTALL-CONFIG.md" "# Install Config

## Install Mode

- Install mode: safe-upgrade

## Folder Truth

- Vendor layer path: \`_agent-system/\`
- Local layer path: \`_agent-system-local/\`
- Runtime layer path: \`_agent-system-runtime/\`

## Runtime Paths

- Active workstreams index: \`_agent-system-runtime/ACTIVE-WORKSTREAMS.md\`
- Checkpoints directory: \`_agent-system-runtime/checkpoints/\`
- Checkpoint events directory: \`_agent-system-runtime/checkpoint-events/\`
- Closeouts directory: \`_agent-system-runtime/closeouts/\`
- Health directory: \`_agent-system-runtime/health/\`
- Observability directory: \`_agent-system-runtime/observability/\`
- Lanes directory: \`_agent-system-runtime/lanes/\`
- Mail directory: \`_agent-system-runtime/mail/\`
- Logs directory: \`_agent-system-runtime/logs/\`
- Archive directory: \`_agent-system-runtime/archive/\`
- Updates directory: \`_agent-system-runtime/updates/\`
- Workstreams directory: \`_agent-system-runtime/workstreams/\`
- Update feed: \`_agent-system-runtime/updates/UPDATE-FEED.md\`
- Update watermarks: \`_agent-system-runtime/updates/UPDATE-WATERMARKS.md\`
- Health summary: \`_agent-system-runtime/health/summary.json\`
- Workstream health: \`_agent-system-runtime/health/workstreams.json\`
- Health dashboard: \`_agent-system-runtime/health/DASHBOARD.md\`
- Turn events: \`_agent-system-runtime/observability/turn-events.jsonl\`
- Observability evidence: \`_agent-system-runtime/observability/evidence.md\`
- Observability metrics: \`_agent-system-runtime/observability/metrics.json\`

## Naming Truth

- Uses phase tags?: [yes / no]
- Phase style: [p1/p2, w1/w2, day0/day1, custom]
- Stable lane key style: [default \`head-<N>\`, \`super-<N>-<slug>\`,
  \`agent-<N>-<workstream>\`, \`doctor-<N>-<slug>\`, \`brainstorm-<N>-<slug>\`]
- Continuation tokens: [default \`--run<N>\` / \`--recover<N>\` or custom]

## Model / Control Truth

- Can this runtime show current model directly?: [yes / no / sometimes]
- Can helpers be pinned to a different runtime reliably?: [yes / no / unknown]
- Exact-control path: manual terminal launch

## Notes

- Orchestration bootstrap installed the upgrade-safe vendor/local/runtime layout.
- Fill in the remaining truth before large multi-chat work starts.
"

write_text_if_missing "$TARGET_ROOT/_agent-system-local/ENABLED-MODULES.md" "# Enabled Modules

## Core Mode

- Lightweight lane enabled?: no
- Full orchestration enabled?: yes
- True dual-brain audited mode enabled?: [yes / no]

## Optional Gates And Systems

- Active chat map enabled?: yes
- Hook-and-health layer enabled?: yes
- Doctor observability layer enabled?: yes
- Lane-awareness layer enabled?: yes
- Context-load gate enabled?: yes
- Spawn-decision gate enabled?: yes
- Self-improvement loop enabled?: yes
- System improvement lane enabled?: yes
- Phase-and-storage system enabled?: yes
- Runtime separation enabled?: yes

## Tooling Modes

- Primary execution tool: Claude Code
- Second review brain enabled?: [yes / no]
- Local model helper enabled?: [yes / no]

## Notes

- Orchestration bootstrap installed the full public orchestration layer.
- Keep buyer-specific overrides in \`_agent-system-local/\`, not in \`_agent-system/\`.
"

echo
echo "Orchestration bootstrap complete: $TARGET_ROOT"
echo "Next recommended reads: _agent-system/QUICK-START.md, FIRST-WEEK-PLAYBOOK.md, _agent-system/DOC-FIRST-ORCHESTRATION.md, UPGRADE-GUIDE.md"
echo "Then run: sh bootstrap/agent-system-doctor.sh <repo-path>"
