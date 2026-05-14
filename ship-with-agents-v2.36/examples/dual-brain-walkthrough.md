# Dual-Brain Walkthrough

A worked example showing how to use a separate review brain alongside a primary
execution tool, and how to escalate that into a true audited closeout loop.
All names, companies, and projects are fictional.

## Scenario

Maya is a solo developer building a REST API for her SaaS product,
TaskPilot. She uses ChatGPT Plus ($20/mo) for strategy and Claude Code
with a Pro plan ($20/mo) for execution. She wants to add rate limiting
to her API.

In the first pass, she uses standard dual-brain mode:

- ChatGPT = planning and review
- Claude Code = execution

On the second pass, she uses true dual-brain audited mode:

- Claude Code builds
- a supervisory review checks implementation quality
- ChatGPT pressure-tests the review before final closeout

## Step 1 - Strategy In Desktop App

Maya opens ChatGPT Desktop and starts a new conversation:

```text
I'm building a REST API for TaskPilot (Node.js, Express, PostgreSQL).
I need to add rate limiting. Here's my current architecture:

- Express app with JWT auth middleware
- PostgreSQL for data, Redis for sessions
- Deployed on a single VPS behind nginx

Requirements:
- Per-user rate limits (100 requests/minute for free tier, 1000 for paid)
- Global rate limit (10,000 requests/minute total)
- Rate limit headers in responses (X-RateLimit-Remaining, etc.)
- Graceful 429 responses with retry-after

What's the best approach? I want something production-ready, not a toy.
```

ChatGPT responds with a plan: use `express-rate-limit` with a Redis
store, implement a custom key generator based on user tier, add
middleware before routes. It recommends a specific file structure and
suggests writing the rate-limit config as a separate module.

Maya asks follow-up questions:

```text
Should the rate limit tiers come from the database or be hardcoded?
What happens if Redis goes down - should we fail open or closed?
```

ChatGPT advises: tiers from a config file (not database - too slow for
every request), fail open with logging (better to serve requests than
block everyone if Redis dies).

## Step 2 - Copy Plan To Terminal

Maya has her plan. She opens Claude Code:

```bash
claude --model claude-sonnet-4-6 --effort high
```

She pastes the plan as instructions:

```text
Read my AGENTS.md.

Task: Add rate limiting to the API. Here's the plan from my strategy chat:

1. Install express-rate-limit and rate-limit-redis
2. Create src/middleware/rate-limit.js with:
   - Redis store (connect to existing Redis instance)
   - Custom key generator: extract user ID from JWT, look up tier
   - Tier config in src/config/rate-limits.json (free: 100/min, paid: 1000/min)
   - Global limit: 10,000/min total
3. Add rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining,
   X-RateLimit-Reset
4. 429 response with Retry-After header
5. Fail open if Redis is unavailable (log warning, allow request)
6. Add middleware to src/app.js before route handlers

Done criteria:
- Rate limit middleware works with existing JWT auth
- Tests pass
- Rate limit headers appear in responses
- 429 returned when limit exceeded

Do not touch: auth middleware, database models, frontend code.
```

Claude Code implements the feature: installs packages, creates the
middleware module, writes tests, adds the middleware to the app.

## Step 3 - Results Back To Desktop

Claude Code finishes. Maya copies the key output back to ChatGPT:

```text
Claude Code finished the rate limiting implementation. Here's what it did:

Files created:
- src/middleware/rate-limit.js (rate limit middleware with Redis store)
- src/config/rate-limits.json (tier configuration)
- tests/middleware/rate-limit.test.js (8 tests, all passing)

Files modified:
- src/app.js (added rate limit middleware before routes)
- package.json (added express-rate-limit, rate-limit-redis)

The fail-open logic logs a warning and allows the request through.
Rate limit headers are added to all responses.

Two things I want your opinion on:
1. Should we add rate limit info to the health check endpoint?
2. The tests mock Redis - should we also have integration tests
   with a real Redis?
```

ChatGPT reviews and advises: yes to health check (add rate-limit
status), integration tests are worth it but can be a follow-up ticket.

That is standard dual-brain mode: useful, but still fairly light.

## Step 4 - Back To Terminal For Refinements

Maya goes back to Claude Code with the refinement:

```text
Add rate limit status to the health check endpoint at GET /health.
Include: current global request count, Redis connection status,
and whether we're in fail-open mode.

Don't create integration tests yet - that's a separate task.
```

Claude Code makes the change. Maya reviews the diff, commits, and
opens a PR.

## Step 5 - True Dual-Brain Audited Closeout

Before treating the work as done, Maya runs a stronger closeout loop.

She asks her supervisory review chat to inspect:

- whether the implementation is secure enough
- whether the fail-open behavior is too permissive
- whether the middleware placement could create bypasses
- whether the health-check additions create misleading operational signals

The supervisory review says:

- implementation is generally strong
- but the health endpoint should not expose too much internal rate-limit detail
- and the fail-open logging needs clearer operator visibility

Maya then takes that review summary back to ChatGPT:

```text
Do an independent audit of this conclusion before I close the task:

- Execution tool implemented Redis-backed per-user and global rate limiting
- Supervisory review thinks the code is strong overall
- Two concerns remain:
  1. Health endpoint may expose too much operational detail
  2. Fail-open logging may be too weak for production debugging

Pressure-test this. What would you inspect before calling this done?
```

ChatGPT replies:

- keep the health endpoint coarse, not operationally chatty
- add an operator-visible metric or structured log on fail-open
- verify the rate-limit middleware cannot run before auth in a way that breaks
  per-user limits

Now Maya has a real audited closeout:

1. execution built the feature
2. supervisory review found quality concerns
3. a second brain challenged that review
4. the work only closes after the remaining issues are addressed

## The Pattern

1. **Plan** in the desktop app - discuss the approach, get a spec
2. **Execute** in Claude Code - paste the spec, let it build
3. **Review** back in the second brain - ask what still looks off
4. **Refine** in Claude Code - apply feedback
5. **Audit closeout** with an independent second-brain challenge when the task
   is quality-sensitive
6. Close only after the review loop is satisfied

## Tips

- **Keep the desktop chat focused on one project.** Don't mix strategy for
  different projects in the same conversation.
- **Copy the plan, not the conversation.** When moving from desktop to
  terminal, paste the final plan - not the entire back-and-forth.
- **Include done criteria.** Claude Code works better with explicit completion
  requirements than vague goals.
- **Report outcomes, not diffs.** When going back to desktop, summarize what
  was built and what decisions remain - don't paste raw code.
- **Not every task needs audited closeout.** Save the heavier dual-brain loop
  for work where weird-but-passing code would actually matter.
- **The desktop app is not mandatory.** If you only have Claude Code, use the
  two-chat method: one terminal for strategy (read-only), one for execution.

## Works With Any Combination

| Strategy Tool | Execution Tool | Notes |
|---|---|---|
| ChatGPT Desktop | Claude Code | Different AI perspectives |
| Claude Desktop | Claude Code | Same AI, different modes |
| Claude Desktop | Codex CLI | Cross-provider execution |
| ChatGPT web | Claude Code | No desktop app needed |
| Any chat tool | Any terminal agent | The pattern is universal |

See `PLATFORM-SETUP.md` for setup instructions for each platform.
