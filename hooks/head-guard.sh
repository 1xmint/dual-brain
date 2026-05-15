#!/usr/bin/env bash
# head-guard.sh — DEPRECATED. Replaced by head-guard.mjs.
#
# This file is kept for reference only. It never worked correctly because it
# reads CLAUDE_TOOL_NAME from the environment, but Claude Code delivers tool
# info via stdin JSON, not environment variables.
#
# The replacement (head-guard.mjs) reads stdin JSON, detects HEAD vs subagent
# via `agent_id`, and returns the correct permissionDecision block format.
#
# Do not use this file. See hooks/head-guard.mjs instead.

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
