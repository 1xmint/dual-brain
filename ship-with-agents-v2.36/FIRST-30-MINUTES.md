# First 30 Minutes

Use this after bootstrap if you want the shortest honest route from install to
one real task.

Do not try to absorb the whole package first.

## Minute 0-5: Pick The Weight

If you have not done this already:

1. Read `CHOOSE-YOUR-SETUP.md`
2. Pick `lightweight` unless you already know you need multi-chat routing
3. Run one bootstrap script from `bootstrap/`
4. Run the doctor

Stop here if the doctor reports red.
Fix the install shape before reading more workflow docs.

## Minute 5-10: Write Only The Durable Local Truth

Fill only what you actually know now:

- `_agent-system-local/OPERATOR-PREFERENCES.md`
- `_agent-system-local/OPERATOR-CAPABILITIES.md` if optional surfaces already
  matter

Do not fill everything just because the file exists.

## Minute 10-15: Choose One Real Chat Or Work Thread

Pick one:

- strategy/review lane
- execution lane
- bounded helper lane

Plain-language note:

- `lane` = chat or work thread

Do not open five chats because the package can support them.

If the visible chat title matters, use full words:

- `Head - Portfolio / Priorities`
- `Supervisor - App Core / Feature Rollout`
- `Agent - App Core / Cache Fix`

Keep the technical lane key internal when the visible title needs to stay
simple.

Default internal lane keys now look like:

- `head-1`
- `super-1-feature-rollout`
- `agent-12-cache-fix`

Do not use the lane number to measure progress. Keep phase, milestone, chunk,
and state in explicit fields instead.

## Minute 15-20: Put Repo Truth In Files

At minimum:

1. open or create `AGENTS.md`
2. state the stack, conventions, constraints, and no-touch areas
3. prepare one task packet or one canonical work doc (called a `slice` in
   orchestration mode), not both

Use:

- `templates/AGENTS.md`
- `templates/task-packet.md`

If the work is still one bounded task, stay with the task packet.
If you naturally call it a plan, spec, or work doc instead of a `slice`, that
is fine.

## Minute 20-30: Do One Real Task

Run one bounded real task through the system.

Good first tasks:

- add or tighten a docs page
- fix a small bug
- add one narrow feature
- pressure-test one risky plan before execution

Bad first tasks:

- redesign the whole workflow
- open many lanes before the first useful result
- migrate to orchestration before packet transport has actually failed

## If You Are Still Unsure

Use this smallest honest path:

1. `CHOOSE-YOUR-SETUP.md`
2. `bootstrap/bootstrap-lightweight.ps1`
3. `bootstrap/agent-system-doctor.ps1`
4. `AGENT-WORKFLOW-GUIDE.md`
5. one real task

## What To Read Next

- Need persona-specific starts: `QUICK-PATHS.md`
- Need tool-surface setup: `PLATFORM-SETUP.md`
- Need healthy first-week behavior: `FIRST-WEEK-PLAYBOOK.md`
- Need true orchestration: `orchestration/QUICK-START.md`

## Final Rule

If you have not reached one clean real task within 30 minutes, add less system,
not more.
