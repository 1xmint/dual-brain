#!/usr/bin/env bash
# head-guard.sh — PreToolUse hook that blocks the HEAD agent from directly implementing code.
#
# Claude Code calls this before every tool invocation:
#   - CLAUDE_TOOL_NAME  = name of the tool being called (e.g. "Edit", "Bash")
#   - stdin             = tool input as JSON
#
# Exit 0  → allow
# Exit 2  → block  (stderr message is shown to Claude)

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

# Block direct file-editing tools unconditionally for HEAD.
case "${TOOL}" in
    Edit|Write|NotebookEdit)
        echo "HEAD cannot implement directly. Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
        ;;
esac

# ── 3. Bash content check ────────────────────────────────────────────────────
# For Bash calls, read stdin JSON and extract the "command" field, then scan for
# write-side shell patterns. Pure bash + standard POSIX utilities — no node
# startup, no network.

if [[ "${TOOL}" == "Bash" ]]; then
    # Read the full JSON input from stdin.
    INPUT="$(cat)"

    # Extract the value of "command" from the JSON.
    # Strategy: grep for the key+value pair, then strip key prefix with sed.
    # Handles normal ASCII command strings (not escaped unicode — acceptable for a guard).
    CMD="$(printf '%s' "${INPUT}" \
        | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
        | head -1 \
        | sed 's/^"command"[[:space:]]*:[[:space:]]*"//;s/"$//')"

    # If we couldn't extract a command (unusual JSON shape), allow through.
    if [[ -z "${CMD}" ]]; then
        exit 0
    fi

    # ── Blocked patterns ─────────────────────────────────────────────────────

    # sed with in-place flag (-i or combined flags like -ni)
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])sed[[:space:]].*-[a-zA-Z]*i'; then
        echo "HEAD cannot implement directly (sed -i). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # Redirect-write: cat > file, echo > file, printf > file (single > only, not >>)
    if printf '%s' "${CMD}" | grep -qE '(cat|echo|printf)[^|]*>[^>]'; then
        echo "HEAD cannot implement directly (redirect write). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # tee writing to a file path (tee /path or tee ./path or tee filename)
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])tee[[:space:]]+[^-]'; then
        echo "HEAD cannot implement directly (tee). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # patch command
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])patch[[:space:]]'; then
        echo "HEAD cannot implement directly (patch). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # Interpreter one-liners that can write files (node -e, python -c, perl -e, ruby -e)
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])(node[[:space:]]+(--eval|-e)|python3?[[:space:]]+-c|perl[[:space:]]+-e|ruby[[:space:]]+-e)[[:space:]]'; then
        echo "HEAD cannot implement directly (interpreter one-liner). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # mv / cp where the destination looks like a source code file
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])(mv|cp)[[:space:]].*\.(js|mjs|cjs|ts|tsx|py|sh|json|yaml|yml|toml|rb|go|rs|java|c|cpp|h|css|html|sql)([[:space:]]|$)'; then
        echo "HEAD cannot implement directly (mv/cp to source file). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # rm on source files
    if printf '%s' "${CMD}" | grep -qE '(^|[[:space:];|&])rm[[:space:]].*\.(js|mjs|cjs|ts|tsx|py|sh|json|yaml|yml|toml|rb|go|rs|java|c|cpp|h|css|html|sql)([[:space:]]|$)'; then
        echo "HEAD cannot implement directly (rm on source file). Use: node hooks/dispatch.mjs --task \"description\"" >&2
        exit 2
    fi

    # Explicitly allowed (read-only) patterns — documented here for clarity.
    # The checks above are specific enough that these don't need explicit allow rules,
    # but listing them makes the intent clear:
    #   grep, find, cat <file (no redirect), git status/log/diff/show,
    #   node --check, ls, wc, head, tail, jq (read), curl (read), etc.
fi

# ── 4. Default: allow ────────────────────────────────────────────────────────
exit 0
