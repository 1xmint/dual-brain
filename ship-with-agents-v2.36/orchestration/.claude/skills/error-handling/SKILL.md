<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: error-handling
description: Boundary validation, failure handling, retries, and graceful degradation. Use when input trust, retries, observability, or recovery behavior matters to correctness.
---

# Error Handling

Use this skill when correctness depends on what happens when things go wrong.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. changed boundary code and its callers
3. `patterns/error-handling.md` when the repo has one

## Default loop

1. Identify the trust boundary and validate there first.
2. Name the failure modes explicitly: bad input, not found, timeout, partial
   success, duplicate request, dependency failure.
3. Decide retry and idempotency semantics instead of implying them.
4. Preserve actionable context without leaking secrets or poisoning logs.

## Watch for

- trusting user or network input too deep in the stack
- retries on non-idempotent operations
- catch-all error handlers that hide the real branch
- logging raw untrusted payloads
- returning success when the operation only half-failed

## Output shape

- `Boundary:`
- `Failure modes:`
- `Retry / idempotency rule:`
- `Safer handling change:`

