# Copilot Instructions

Project instructions for GitHub Copilot. Place this file at `.github/copilot-instructions.md` in your repo.

Derived from the `AGENTS.md` principles in the Repo Ops Starter Pack. `AGENTS.md` remains the canonical source for repo-level rules. This file adapts those principles for Copilot's instruction format.

## Project Identity

This project is: `<one-sentence description>`

## Tech Stack

- Language: `<language>`
- Framework: `<framework>`
- Database: `<database>`
- Test runner: `<test-runner>`

## Conventions

- Follow existing code patterns in the repo. Do not introduce new abstractions without asking.
- Prefer small, focused changes over large rewrites.
- Use `<naming-convention>` for variables and functions.
- Keep imports organized: `<import ordering preference>`.

## Workflow Rules

- Normal flow is: branch, PR, checks, merge, deploy.
- Do not modify files outside the scope of the current task.
- Run tests after making code changes: `<test-command>`
- Do not commit directly to the main branch.

## Stop-And-Ask List

Pause and wait for human approval before:

- merging a PR
- deploying or publishing
- deleting files, branches, or data
- changing secrets or environment variables
- modifying CI/CD pipelines
- any change to paying-customer surfaces

## Code Quality

- No unrelated refactors alongside feature work.
- No dependency upgrades unless explicitly requested.
- Check that tests pass before marking work as done.

## What Not To Touch

- `<generated files, vendor directories, lock files>`
- `<paths the agent should not modify without asking>`

## See Also

For the full repo memory (branch truth, merge conventions, deploy rules, operational gotchas), see `AGENTS.md` in the repo root.
