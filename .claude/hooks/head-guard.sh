#!/usr/bin/env bash
# head-guard.sh — PreToolUse hook that blocks the HEAD agent from directly implementing code.
#
# Claude Code calls this before every tool invocation:
#   - CLAUDE_TOOL_NAME  = name of the tool being called (e.g. "Edit", "Bash")
#   - stdin             = tool input as JSON
#
# Exit 0  → allow
# Exit 2  → block  (stderr message is shown to Claude)

BLOCK_MSG='[dual-brain] HEAD cannot use this tool directly. Dispatch via: dual-brain go "task description"'

# ── 1. Role check ────────────────────────────────────────────────────────────
# Only enforce when the session has been explicitly marked as the HEAD agent.
# If the env var is unset we allow everything (backward compat for non-dual-brain usage).

if [[ -z "${DUAL_BRAIN_ROLE}" ]]; then
    exit 0
fi

if [[ "${DUAL_BRAIN_ROLE}" != "head" ]]; then
    # Work-agent session — no restrictions.
    exit 0
fi

# ── 2. Tool name check ───────────────────────────────────────────────────────
TOOL="${CLAUDE_TOOL_NAME:-}"

# Block direct file-editing tools and Bash unconditionally for HEAD.
# HEAD should use Read tool for reading and Agent (via dual-brain go) for all other work.
case "${TOOL}" in
    Edit|Write|NotebookEdit|Bash)
        echo "${BLOCK_MSG}" >&2
        exit 2
        ;;
esac

# ── 3. Default: allow ────────────────────────────────────────────────────────
exit 0
