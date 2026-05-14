# GitHub PR, CI, and Deploy Guide

How to use GitHub's branch, pull request, CI, and deploy layer properly — even on a solo project.

This guide is step-by-step and practical. It is for anyone who has been pushing directly to `main` and wants a safer, more repeatable workflow before something breaks at the worst time.

## What This Guide Does Not Do

- It is not a GitHub training course. Official GitHub docs cover that.
- Examples use GitHub Actions because it is the most common starting point, not because it is the only valid choice.
- It does not guarantee safe deploys. It gives you a structure that makes mistakes visible and reversible.
- It does not replace professional DevOps for complex or high-stakes systems.

## The Core Flow

Every non-trivial change should follow this path:

```
branch → commit → PR → CI checks → review → merge → deploy trigger
```

Not:

```
edit main → push → hope
```

Even on a solo project. The habit matters most when something breaks — and something always breaks.

---

## 1. Branching

### When to branch

Branch for any change you would not want to immediately and permanently affect production. In practice: branch for everything non-trivial.

Good branch names describe the change:

```
feat/user-auth
fix/login-redirect-loop
docs/update-agents-readme
chore/upgrade-dependencies
```

Bad branch names:

```
my-branch
temp
fix2
working
```

### Create a branch

```bash
git checkout main
git pull
git checkout -b feat/your-feature-name
```

Make your changes, then commit and push:

```bash
git add path/to/changed-file.ts
git commit -m "feat: add user auth with email verification"
git push -u origin feat/your-feature-name
```

---

## 2. Opening a PR

### What a PR should contain

One logical change. Not five things that were convenient to combine.

A minimal PR description covers:

- **What changed** — one or two sentences. Specific.
- **Why** — the reason for the change.
- **How to test** — one sentence a reviewer could follow.
- **Any edge cases or risks** — what you know could go wrong.

Even solo, writing this before merge is useful. You are reviewing your own work and it often surfaces issues.

### Draft PRs

Open as draft while work is in progress. Draft PRs run CI without appearing as merge-ready.

```bash
gh pr create --draft --title "feat: add user auth" --body "Work in progress"
```

Mark ready when done:

```bash
gh pr ready
```

### PR template

Add `.github/PULL_REQUEST_TEMPLATE.md` to your repo to pre-fill this structure on every PR. See `REPO-DOCS-SYSTEM-TUTORIAL.md` for a ready-to-copy template.

---

## 3. CI and Status Checks

CI runs automatically when you push. For GitHub Actions, your workflow files live in `.github/workflows/`.

### A minimal CI workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin-to-sha>
      - uses: actions/setup-node@<pin-to-sha>
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
```

**Pin actions to commit SHAs, not just tags.** Tags like `@v4` can be changed or reassigned. A full SHA (`actions/checkout@abc1234def5678...`) cannot. Find the current SHA for any action on GitHub under its releases page.

### Enable required status checks

Repo settings → Branches → Branch protection rules → add a rule for `main`:

- Require a pull request before merging
- Require status checks to pass before merging
- Select the CI job name (e.g. `test`)
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions

**Checkpoint: After setting up branch protection, open a test PR that breaks a test. Confirm GitHub blocks the merge. This verifies the protection is actually in effect, not just configured.**

---

## 4. Merge Strategy

### Squash and merge (recommended default)

Squash combines all commits from a branch into one on `main`. The branch commit history is preserved in the squash commit's body.

Benefits:
- `main` stays linear and readable
- one revert undoes the whole feature if needed
- commit messages on `main` stay meaningful instead of stacking "wip" entries

Use squash for most feature, fix, and chore branches.

### Merge commit

Use when preserving full branch commit history is intentionally valuable — a long-lived project where each commit carries meaning, or a staged migration.

### Auto-merge

GitHub's auto-merge merges a PR automatically once CI passes and all branch protection requirements are met.

Good use: the PR is reviewed and approved; you do not want to babysit the CI run.

Enable it:

```bash
gh pr merge --auto --squash
```

Or via the GitHub UI on the PR page.

**Caution:** auto-merge on every PR with no human review removes the checkpoint. Use it after review approval, not as a way to skip review.

---

## 5. GitHub Security Features

Enable these in your repo settings when available:

- Dependency graph
- Dependabot alerts (vulnerable dependencies)
- Dependabot security updates
- Private vulnerability reporting
- Secret scanning / secret protection
- Push protection (blocks pushes that contain detected secrets)
- Code scanning

These are free for public repos and available on most GitHub plans. They do not make your repo exempt from issues — they alert you to common ones.

---

## 6. Deploy Gates

### The simplest safe deploy flow

```
merge to main → manually trigger deploy workflow
```

Not:

```
merge to main → automatically deploy
```

Auto-deploy on merge means every merge immediately affects production. That is a reasonable choice when your project is mature and test coverage is strong. It is risky for an evolving project where a bad merge could take the app down.

Start with manual deploys triggered from GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deploy target'
        required: true
        default: 'production'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # Requires manual approval if configured
    steps:
      - uses: actions/checkout@<pin-to-sha>
      - name: Deploy
        run: |
          # Your deploy command here
          echo "Deploying to ${{ github.event.inputs.environment }}"
```

Trigger it:

```bash
gh workflow run deploy.yml -f environment=production
```

Or from the GitHub UI: Actions tab → Deploy → Run workflow.

### GitHub Environments and manual approvals

For an extra gate on production:

1. Repo settings → Environments → New environment → name it `production`
2. Add Required reviewers (add yourself)

Now every production deploy requires someone to manually approve it in GitHub before the deploy job starts.

---

## 7. Secrets and Deploy Keys

Store secrets in GitHub — not in your code.

Repo settings → Secrets and variables → Actions → New repository secret

Reference them in workflows:

```yaml
- name: Deploy
  env:
    DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
    API_TOKEN: ${{ secrets.API_TOKEN }}
  run: ./scripts/deploy.sh
```

Rules:
- Never put secrets directly in workflow files.
- Never commit `.env` files to the repo.
- If a secret leaks, rotate it immediately. GitHub's secret scanning will alert you if it detects one in a push.

---

## 8. Separating CI, Deploy, and Publish Workflows

Do not put everything in one giant workflow. Keep workflows small and purposeful:

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | push / PR | install, lint, test |
| `deploy.yml` | `workflow_dispatch` | deploys to server |
| `publish.yml` | `workflow_dispatch` or release tag | publishes package |
| `security.yml` | schedule / push | runs code scanning |

Separate workflows are easier to debug, easier to grant narrow permissions to, and clearer about what is happening when.

---

## 9. Working With AI Agents in This Flow

**What agents can do:**

- Create branches and make commits.
- Push branches and open PRs.
- Fix failing tests and update CI.
- Write PR descriptions.

**What agents must ask before doing:**

- Merging any PR.
- Triggering any deploy.
- Changing any workflow file.
- Changing branch protection settings.
- Rotating or adding secrets.
- Pushing to `main` directly.

Put this list in `AGENTS.md` so it is durable, not per-session.

**Loop rule:** After the agent opens a PR or pushes a fix, you read the diff before merging. "The agent said it is ready" is not a merge reason.

---

## 10. Common Failure Modes

**"I merged a bad change and it broke production."**

Revert is your friend. `git revert` creates a new commit undoing the change. Open a PR with it. Then investigate why CI did not catch it.

**"CI passes but the feature does not work."**

Tests that pass do not prove a feature works end-to-end. Add integration tests or test the feature yourself before marking done.

**"CI is consistently failing but the code looks fine."**

Check whether the test environment matches your dev environment (runtime version, env vars). Check whether tests depend on external services that might be unavailable in CI. Check for order-dependent tests.

**"Builds take forever."**

Add dependency caching to your workflow. Split fast unit tests from slow integration tests. Do not run the deploy job on every PR push.

**"The agent keeps pushing directly to main."**

Branch protection is the mechanical defense. Enable it. Also add to `AGENTS.md`: "Never push directly to main. Always work on a branch and open a PR."

---

## Quick-Reference Checklist

Copy this into a new repo setup task:

- [ ] Default branch created and set as `main` (or chosen trunk)
- [ ] Branch protection on `main`: require PR, require CI, require up-to-date, no force push, no deletions
- [ ] `ci.yml` workflow created in `.github/workflows/`
- [ ] Actions pinned to commit SHAs
- [ ] Test PR opened to confirm CI runs and branch protection blocks bad merges
- [ ] `deploy.yml` with `workflow_dispatch` trigger created
- [ ] Secrets stored in GitHub Secrets
- [ ] Merge strategy decided (squash recommended as default)
- [ ] Auto-merge enabled (use after review approval)
- [ ] GitHub security features enabled
- [ ] Agent rules in `AGENTS.md`: ask before merge, ask before deploy, never push to main directly

That is enough to start. It will not prevent every mistake, but it will make mistakes visible and reversible.
