# Code Quality Pattern

This system should improve the work itself, not only the coordination around
the work. The craft layer exists to make small-team shipping safer, more
testable, and easier to review under real time and quota pressure.

## What this layer must do

1. Detect the project ecosystem before prescribing checks.
2. Run the right quality gates for that ecosystem instead of saying
   `npm test / pytest / equivalent` and hoping the user fills in the gap.
3. Load the smallest craft skill that matches the real coding problem:
   review, tests, refactor risk, error handling, API shape, or commit hygiene.
4. Record recurring friction so doctor audits can improve the craft layer from
   evidence instead of from vague recollection.

## Quality loop

For any non-trivial code change, the default loop is:

1. detect the stack
2. implement the smallest change that satisfies the task
3. run stack-aware quality checks
4. inspect failures specifically
5. either repair or stop with an honest blocker

The loop is ecosystem-aware. A Node repo should not be treated like a Python
repo, and a Rust repo should not be asked for `pytest`.

## Stack-aware verification

The default quality runner should look for these classes of checks:

| Stack | Type / static check | Lint / hygiene | Tests |
|---|---|---|---|
| Node / TS | `typecheck` script or `tsc --noEmit` when available | `lint` script or local `eslint` | `test` script |
| Python | `pyright` or `mypy` when configured and installed | `ruff` when configured and installed | `pytest` when configured and installed |
| Rust | `cargo check --all-targets` | `cargo clippy --all-targets --all-features -- -D warnings` when available | `cargo test` |
| Go | `go vet ./...` | `gofmt -l .` when available | `go test ./...` |

If a repo has no configured quality tool for one of these categories, the
system must say so plainly. Missing quality infrastructure is a signal, not a
silent success.

## Craft skill boundaries

### `code-review`

Use for changed-code review substance:
- missing input validation
- silent error swallowing
- retry / idempotency mistakes
- off-by-one logic
- mutation or state hazards
- regression risk and proof gaps

### `test-design`

Use when deciding:
- what test level is load-bearing
- which edge case proves the change
- when to mock vs. not mock
- whether assertions are specific enough
- whether the test would fail for the right reason

### `refactoring-patterns`

Use when code quality depends on safe reshaping:
- separate mechanical refactor from behavior change
- scaffold before change
- prefer extraction / rename / move before abstraction invention
- call out when the blast radius exceeds the task

### `error-handling`

Use when boundaries, retries, degradation, and observability matter:
- validate untrusted input at boundaries
- name retry semantics explicitly
- preserve actionable error context
- avoid log poisoning or swallow-and-continue behavior

### `api-design`

Use when changing a public or semi-public surface:
- naming and parameter ordering
- return / error contract
- compatibility and migration path
- optionality, defaults, and caller expectations

### `commit-hygiene`

Use when staging or summarizing a code change:
- one concern per commit
- only related files staged
- message explains why and risk, not only what changed
- unresolved failures are not hidden behind a "green enough" commit

## Anti-patterns

- Treating passing tests as proof when type errors or lint failures still exist.
- Calling a review "done" without reading for failure modes.
- Folding a refactor into a bug fix when the bug could have been fixed directly.
- Accepting "works locally" as a replacement for the smallest real proof.
- Writing a commit that bundles unrelated cleanup because the files were open.

## Scope boundary

This pattern is for buyer project work. It does not turn the `Agents` repo's
own pre-commit hook into a user-code lint gate. Instead it ships the craft
instructions, stack detection, and quality runner that buyer repos can use.
