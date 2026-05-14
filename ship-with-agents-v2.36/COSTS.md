# Costs and Context

What this pack actually costs to run, and how to keep that cost
under control.

> **Pricing fetched 2026-04-26.** Anthropic prices change. This doc
> gives ranges and ratios -- verify current numbers at
> [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
> and [claude.com/pricing](https://claude.com/pricing) before quoting
> any specific dollar figure.

---

## What changed in this rewrite

This rewrite replaces the three-tier model (Starter / Hybrid / Pro)
with four named usage modes (Budget / Standard / Pro / Max). Modes
are portable language -- "run this in Max" works regardless of which
role hears it, and the mode default sets a floor that per-chat
overrides can raise.

Two orthogonal dials underpin the model:

1. **Quality dial** -- Budget -> Standard -> Pro -> Max. Controls
   which models and effort levels run at each layer. Most users only
   touch this one.
2. **Review dial** -- none -> spot-check -> on-request -> always.
   Controls whether a second provider cross-checks primary output.
   Activates per-chat for high-stakes work; independent of the
   quality setting.

"Hybrid" is retired. "Standard" takes its place because the old name
described the mechanism (mixed models); "Standard" describes the
customer benefit (reliable orchestration at a predictable cost).

No token or pricing numbers were changed. Those are pinned to the
fetch date.

---

## TL;DR -- what it costs to run this pack

The orchestration system runs on top of Anthropic's API or Claude
plans. There are four usage modes you can run any chat in:

| Mode | Coordination layers (head/super) | Workers (agent/subagent) | Cross-provider review | Solo daily user (~1 hr/day, 22 days/mo) | Typical setup |
|---|---|---|---|---|---|
| **Budget** | Cost-effective model, medium effort | Cheapest model, low effort | Never | ~$70-220 / mo API, or covered by a $20-100/mo subscription | Any plan with a capable model (Claude Pro, GPT Plus, local) |
| **Standard** | Strongest model, low-to-high effort | Cost-effective model, medium effort | Spot-check available (off by default) | ~$300-900 / mo API | Plan with strong + cost-effective models (Claude Max, GPT Plus + local, etc.) |
| **Pro** | Strongest model, high effort | Cost-effective model, high effort | On request; always for security, license, legal, irreversible | ~$900-3,300 / mo API | Top-tier plan or API direct (Claude Max 20x, API credits, etc.) |
| **Max** | Strongest model, xhigh or max effort | Strongest model, high or xhigh effort | Always for any commit-grade change | Varies; ~3-5x Pro | Multiple providers or top-tier plan + API (for cross-provider review) |

> **Max mode cost note:** Driven by top-tier model premiums, the
> highest effort level your surface supports (Claude Code: `xhigh`
> or `max`; Claude Desktop app: extra-high or max), and always-on
> cross-provider review doubling per-tick cost on commit-grade work.
> Measure on a bounded session before adopting as a default. See
> `orchestration/MODEL-CONFIG.md` for the full effort-level palette,
> cross-surface translation table, and currently pinned model IDs.

**Cost-aware dispatch is built into the role definitions.** The
four-mode framing above is reinforced at the role level: head
and super each have a Model Awareness and Dispatch
section in their durable prompts that defaults mechanical work
to Sonnet via super, reserves Opus for judgment work, and asks
the user before expensive multi-stage turns. This is not a
suggestion; it is load-bearing role behavior. See
`orchestration/head-prompt.md` and `orchestration/super-prompt.md`
for the role-level enforcement.

Three things to know up front:

1. **You can run the entire pack in Budget mode.** The orchestration
   patterns work; you trade some reasoning depth for roughly 5x lower
   cost. Budget mode is a real, supported configuration -- not a
   stripped experience.
2. **Max mode with always-on cross-check is the most expensive
   configuration this pack supports.** If you default to it without
   understanding the cost shape, you will be surprised by your bill.
3. **The mode default sets the floor; per-chat override always
   applies.** "Run this chat in Max" raises the floor for that chat
   only. The next chat reverts to the package default.

If you're new and budget-anxious: start in Budget mode, run for a
week, then escalate to Standard or Pro only where the work justifies
it.

---

## The two knobs that dominate cost

Everything else is detail. The cost of a session is roughly:

> **Cost ~= (model rate) x (token volume) x (number of agents) / (cache hit rate)**

- **Model rate** is the per-million-token price. Opus is ~5x Sonnet,
  which is ~3-10x Haiku.
- **Token volume** is how much you read, generate, and re-process --
  long sessions, large file reads, and re-reading checkpoints all
  inflate this.
- **Number of agents** is the parallelism multiplier. Measured data
  shows a 3-agent team using ~7x the tokens of a solo session because
  every child gets its own system prompt + tool definitions loaded.
- **Cache hit rate** is the divisor that brings everything else
  back. A well-cached session pays ~90% less for the cached portion
  of input. See "Prompt caching" below.

If you remember nothing else: caching is the lever that swings
biggest. Get it right and Opus-tier work becomes affordable; get it
wrong and Sonnet-tier work feels expensive.

---

## Picking a mode

### Budget mode -- Sonnet floor, standard effort

Everything (head, super, agents, brainstorm) runs on
`claude-sonnet-4-6 + standard effort`. Optionally use Haiku 4.5 for
mechanical sub-jobs (search, lint summary, doc reformatting).

Cross-provider review: never.

**When it fits:**
- You're new to multi-agent orchestration and want to learn the
  shape before committing to Opus bills
- Your work is mostly mechanical -- feature builds, doc work, refactors
  with clear specs
- You're on Pro $20/mo or Max 5x $100/mo and want the system to
  fit inside that quota

**When it falls short:**
- Architecture decisions, novel system design, security-sensitive
  work -- Sonnet can do these but you'll spend more turns getting to
  the same answer than Opus would
- Long ambiguous tasks where the model needs to weigh many
  considerations

**Multi-provider note:** Budget works with any single provider.
Adding a second provider adds nothing at this tier -- save the
cross-check budget for Standard or above.

### Standard mode -- Opus coordination, Sonnet workers

Head and brainstorms run on `claude-opus-4-6 + high effort`. Super
and agents run on `claude-sonnet-4-6 + high effort`.
Subagents (Explore, verification) on Sonnet or Haiku.

Cross-provider review is OFF by default in Standard. Opt in to enable
spot-check at 10% sample rate, or flag specific chats with the per-chat
override. Enable in `orchestration/MODEL-CONFIG.md` when you want
ongoing quality sampling without reviewing every output.

**When it fits:**
- You want sharp strategic reasoning at a manageable cost
- You're doing a mix of strategy work and execution work and don't
  want to underspend on either
- This is the cost sweet spot most practitioners land on after a few
  weeks of use

**Multi-provider note:** Single provider is typical at Standard. A
second provider enables spot-check review if desired -- configure it
in `orchestration/MODEL-CONFIG.md` and enable a second-provider review
workflow only if your setup truly needs it.

### Pro mode -- Opus floor, review on request

Head, super, brainstorms, and agents on Opus. Workers on
Opus standard or Sonnet high depending on task risk.

Cross-provider review fires on request and automatically for:
- Security-touching work (auth, credentials, crypto, trust model)
- License or legal calls
- Irreversible public-state changes (release published, branch
  force-pushed, customer data written)

**When it fits:**
- The work is novel, architecture-defining, or expensive-to-reverse
- You're scaling a real production system and the cost of a wrong
  agent decision exceeds a few hundred dollars in tokens
- You have credits to burn or you've measured the quality difference
  and decided it's worth it on your workload

**When it doesn't fit:**
- Routine feature work (Standard is fine; Pro is overkill)
- Anything where you haven't measured the quality lift on your
  specific tasks

**Multi-provider note:** Cross-provider review fires automatically on
security, legal, and irreversible work at this tier. This requires a
second provider configured in `orchestration/MODEL-CONFIG.md`. If your
second provider is unavailable, Pro falls back to single-provider with
a warning flag.

### Max mode -- top model everywhere, always-on review

All layers run on the latest top model at high effort. (see
`orchestration/MODEL-CONFIG.md` for the currently pinned model IDs.)
Cross-provider review fires for every commit-grade change. Intended
for sessions where the cost of a wrong call materially exceeds the
cost of the extra tokens: release decisions, security protocol design,
novel architecture that sets precedent for the whole project.

**When it fits:**
- Sessions where you've already run Standard or Pro and a gap
  surfaced that warrants a stronger pass
- Any session where you need an independent second opinion on every
  output, not just the high-stakes pieces

**When it doesn't fit:**
- Daily feature work -- high effort at the top model generates
  substantially more output tokens per turn; this accumulates fast
- Any session you haven't scoped explicitly -- open-ended Max mode
  sessions are the most common source of large unexpected bills

**Multi-provider note:** Always-on cross-provider review requires two
active providers. If your second provider is maxed or unavailable, Max
mode falls back to Pro behavior (single-provider, review on request
only) with a warning. Do not run Max without confirming both providers
are active.

### How to switch modes

Edit `orchestration/MODEL-CONFIG.md` for static configuration. Or
override mid-session ("Run this in Max, security-critical" / "Back
to Standard for everything else"). The head and super honor
runtime overrides per `MODEL-CONFIG.md`'s Model Decision Protocol.

The mode default is the floor. Per-chat override raises it for that
chat only. The next chat reverts to the package default unless the
user restates the override.

---

## Common provider combos

The modes are behavior profiles, not subscription tiers. The same
mode plays out differently depending on what providers and plans you
have. Here is how the modes map for common setups.

### Claude Pro only ($20/mo)

Sonnet is your only model. Budget and Standard are your everyday
modes -- they differ by effort level, not model. Pro and Max use
higher effort on the same Sonnet, which still helps on hard problems
but does not give you a stronger model. For access to a stronger
model, add a second provider or upgrade your Claude plan.

Available modes: all four, but Pro/Max quality ceiling is lower than
setups with access to a stronger model. Start at Standard.

### Claude Max ($100-200/mo)

All four modes are fully available. Max 5x users (~50 Opus messages
per 5-hour window) should watch window limits -- drop coordination
layers to Sonnet when Opus is near cap. Max 20x users have room for
Opus across most roles.

Recommended default: Pro. Standard for routine work. Max for
security audits and architecture sessions.

### Claude + OpenAI combo

Claude for execution (Sonnet agents via Claude Code), GPT for
strategy or cross-check review. This setup unlocks multi-provider
review at Standard tier and above without paying for a top-tier plan
on both providers. Example: GPT-4o head + Claude Sonnet agents in
Standard; Opus head + Sonnet agents + GPT cross-check in Pro.

Recommended default: Standard with GPT spot-check enabled. Upgrade to
Pro when security or legal work starts.

### Local + cloud hybrid

Local models (Ollama, LM Studio) for Budget/Standard bulk work at
zero marginal cost. Cloud provider reserved for Pro/Max judgment and
cross-check. Total cloud spend stays low because the high-volume
mechanical work runs locally.

Recommended default: Budget (local) for agents, Standard (cloud) for
coordination. Upgrade coordination to Pro for trust-adjacent work.

### API direct (no subscription)

Pay-per-token, all modes available, cost scales linearly with usage.
No subscription ceiling or window limits. Best for teams who need
predictable per-project billing or who exceed subscription quotas.
Monitor with per-key spending limits in the Anthropic Console.

Recommended default: Standard. Set a monthly spending cap before your
first Pro or Max session.

---

## Cross-provider review -- two brains, bounded cost

Multi-provider review catches blind spots that single-provider runs
miss: model-specific reasoning habits, missed edge cases in security
logic, divergent framings on ambiguous requirements. One brain drafts;
the other challenges. The shared substrate is the file system --
checkpoints, artifacts, and review files -- not chat history, which
is vendor-locked.

**Cost:** Cross-provider review roughly doubles the per-tick cost on
the reviewed work, not on every tick. Total cost is bounded by how
disciplined the trigger conditions are. A spot-check at 10% of tasks
adds roughly 10% to that layer's cost.

**Trigger conditions by mode:**

| Trigger | Budget | Standard | Pro | Max |
|---|---|---|---|---|
| Security, auth, crypto, trust | Never | Spot-check if enabled | Always | Always |
| License or legal calls | Never | Spot-check if enabled | Always | Always |
| Irreversible public state | Never | Spot-check if enabled | Always | Always |
| On explicit request | Never | Supported | Supported | Supported |
| All commit-grade changes | Never | Never | Never | Always |
| Mechanical / format-only work | Never | Never | Never | Never |

**Runaway concern:** Multi-provider runs carry higher runaway risk
than single-provider runs. A spot-check rate misconfigured too high,
or always-on review left running on routine work, compounds fast.
Reference `TROUBLESHOOTING.md` entry 12 for the kill-switch procedure.
Set up monitoring before enabling any cross-provider review mode.

**Cost in the completion report:** When cross-check was triggered,
report it: "Cross-check triggered: [reason]. Estimated additional
cost: [rough token count or time]."

For mixed-tool setup details, see `TOOL-TRANSLATION-GUIDE.md` and
`orchestration/gpt-info.md`.

---

## The five cost levers, biggest first

### 1. Prompt caching -- the single biggest lever

Anthropic charges ~10% of normal input cost for cache reads. A
well-cached session re-reading a 50K-token system prompt 30 times
pays roughly $3 instead of $22 on Opus -- about an 86% saving on the
cached portion.

**How to get high cache hit rates:**

- Put stable content first: system prompt -> tool definitions -> long
  reference docs -> conversation. The cache is prefix-matched; any
  change above a `cache_control` breakpoint invalidates everything
  after.
- Use the 1-hour TTL for long sessions (2x base input write cost,
  but it doesn't expire on a coffee break). 5-minute TTL is the
  default and fine for tight loops.
- When you rotate sessions, re-establish the same stable prefix at
  the top -- the second call warms the cache for the rest of the
  session.

**Watch out:**
- Prompts under ~1,024 tokens silently won't cache.
- If your prompt is dynamic at the top (timestamps, session IDs),
  every call invalidates. Move dynamic content below the cache
  breakpoint.
- A March 2026 regression silently dropped 1-hour TTLs to 5 minutes
  for some Claude Code users -- verify your `/cost` cache hit rate is
  what you expect.

### 2. Subagent delegation -- when it saves vs. when it costs

Claude Code's `Agent` / `Explore` / `Plan` subagents run with
isolated context. The parent only sees the subagent's final summary.
This is great for protecting the parent's context window from noisy
intermediate output.

**Delegate aggressively for:**
- Open-ended search or grep that returns big output
- Verification runs (test suites, lint, type-check) with noisy
  stdout
- Multi-file investigations where only a conclusion matters
- Work that would otherwise pollute the parent's narrative thread

**Handle inline for:**
- Single-file edits the parent already has loaded
- Continuations of in-flight reasoning
- Tightly-coupled chains where re-establishing context for a child
  costs more than the saved parent tokens

**The cost trade-off:** every subagent is a separate billable
session with its own prompt + tools loaded. A 3-agent team can use
~7x the tokens of a solo session. Net savings only when the avoided
parent context bloat outweighs the per-child overhead.

Heuristic: delegate when the avoided context cost exceeds one
subagent's worth of fresh context.

### 3. Extended thinking -- when it earns its cost

Extended thinking (the model's hidden reasoning before responding)
counts as output tokens at the model's full output rate. On Opus
this is the single largest swing variable per call.

**Use for:**
- Multi-step math or symbolic reasoning where intermediate results
  compound
- Complex debugging across multiple files
- Multi-step planning where early decisions constrain later ones
- Trade-off analysis (architectural, legal, security)

**Skip for:**
- Direct recall, classification, format conversion
- Short creative outputs where taste, not deliberation, matters
- Mechanical work with clear specs

A practitioner heuristic: if you can't name the steps you'd expect
the model to think through, it probably doesn't need extended
thinking. Research has shown up to ~36% performance degradation
when extended thinking is enabled on the wrong task type -- overthinking
hurts.

Anthropic's recommended budget tiers:
- 3K-5K tokens: simple multi-step reasoning
- 5K-10K: complex analysis with trade-offs
- 10K-50K: offline / batch deep analysis
- Max budget: critical correctness (financial / medical / legal)

### 4. Session rotation hygiene

Quality degrades non-linearly as context fills. Symptoms:
forgetting earlier decisions, repeating itself, vague summaries,
hallucinated function names from earlier turns, ignoring instructions
visible in the buffer.

**Rotate before degradation, not after:**
- 65% of context window -- safe default
- 60% -- better for complex multi-file work
- 55% -- high-stakes work where context quality is critical
- Auto-compaction triggers around 80% -- by then quality is already
  degraded

**Rotation = cache miss.** To soften:
- Write the handover doc before rotating (model still coherent)
- Re-establish the same stable prefix in the new session so the
  cache warms on the second call
- Batch the warm-up: paste handover + key files in one initial
  message so a single cache write covers the whole stable prefix

In a head + super + N agents pattern, rotate the head/super on
schedule (highest context bloat); subagents are short-lived enough
that rotation rarely matters for them.

### 5. Model selection per role

Don't run Opus where Sonnet is fine. Don't run Sonnet where Haiku is
fine.

| Task type | Right model |
|---|---|
| Strategic decisions, architecture, trust calls | Opus |
| Build/dev coordination (super) | Opus or Sonnet -- depends on your mode |
| Top-level coordination (head) | Opus or Sonnet -- same |
| Feature implementation, bug fixes | Sonnet |
| Mechanical work (rename, reformat, doc updates) | Sonnet standard effort or Haiku |
| Search, lint summary, file inspection (subagents) | Haiku |
| Security/auth/crypto / release-critical | Opus regardless of mode |

The escalation rule: cheap by default, expensive when the cost of a
wrong call exceeds the cost of running the better model.

---

## Mode-specific guidance

### Auto Mode

A background classifier (running on Sonnet) evaluates each tool call
before execution, blocking obviously dangerous actions and letting
safe ones proceed without prompting you. Available on Team,
Enterprise, API, and Max -- not on Pro, Bedrock, Vertex, or Foundry.

**Cost effect:**
- Adds Sonnet classifier overhead on most tool calls
- Reduces user-prompt friction -> Claude takes more actions per task
  -> longer sessions, higher total spend
- Net cost depends entirely on whether the reduced friction matters
  more than the classifier overhead

**When `defaultMode: default` (no auto) is cheaper:**
- Short, well-defined tasks where you'd auto-approve everything
  anyway
- Workflows where you want the human-in-the-loop pause to avoid
  runaway costs

If unsure: measure with `/cost` before and after toggling on your
actual workload.

### Fast Mode

`/fast` then Tab in Claude Code v2.1.36+. Routes Opus 4.6 calls
through a high-priority serving path with ~2.5x faster output
throughput. **Not a different model -- same Opus, faster delivery.**

**Pricing:** ~2x base input + ~2x base output per million tokens.
Premium for speed. On subscription plans, Fast Mode is "extra usage"
billed at API rates -- not included in the base allowance.

**Use for:**
- Tight debugging loops with many short turns (saves real wall-clock
  time)
- Live pairing where latency hurts flow

**Skip for:**
- Long autonomous runs (latency doesn't matter; you're paying 2x
  for nothing)
- Background agents
- Anything Sonnet would have handled

---

## Monitoring and guardrails

Set these up before your first long Opus session. The first
runaway is the most expensive lesson.

### Built into Anthropic Console
- **Usage page** -- token + cost breakdown by model, by API key, by
  date
- **Per-key spending limits** -- hard caps on individual API keys.
  Use a separate dev key with a low cap for experimentation
- **Usage tiers** -- monthly spend caps that auto-raise as you pay;
  explicit pre-authorization to go higher
- **Admin API** (`/v1/organizations/cost_report`) -- programmatic
  cost reporting; requires admin key

### Built into Claude Code
- **`/cost`** -- per-model cost breakdown for the current session,
  cache hit rate, rate-limit utilization
- **Statusline hooks** -- feed a JSON blob to your shell command on
  every tick; use this for live cost display
- **Local logs** -- `~/.claude/` writes detailed JSONL usage logs

### Community tools
- **[ccusage](https://github.com/ryoppippi/ccusage)** -- CLI +
  statusline; current session cost, today's total, burn rate
- **[ccost](https://github.com/toolsu/ccost)** -- analyzes statusline
  JSONL for budget tracking
- **[claude-code-statusline](https://github.com/levz0r/claude-code-statusline)**
  -- real-time token tracking + git integration
- **[Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)**
  -- terminal monitor with predictions/warnings
- **[LiteLLM proxy](https://docs.litellm.ai/docs/proxy/customer_usage)**
  -- full spend analytics for teams (per-team, per-user)

### Minimum recommended setup
1. Set a monthly spend cap in Anthropic Console (start at 2x your
   expected usage)
2. Use a separate API key for Claude Code with its own per-key cap
3. Install `ccusage` for live statusline cost
4. Glance at `/cost` at the end of every session for a week to
   calibrate your expectations

---

## Pricing reference (fetched 2026-04-26)

Per million tokens, USD, API tier. **Verify before quoting** -- prices
have shifted multiple times in 2026.

| Model | Input | Output | 5-min cache write | 1-hr cache write | Cache read |
|---|---|---|---|---|---|
| Opus 4.7 | $15 | $75 | $18.75 | $30 | $1.50 |
| Opus 4.6 | $15 | $75 | $18.75 | $30 | $1.50 |
| Opus 4.6 (Fast) | $30 | $150 | (2x base) | (2x base) | (0.1x base) |
| Sonnet 4.6 | $3 | $15 | $3.75 | $6 | $0.30 |
| Haiku 4.5 | $1 | $5 | $1.25 | $2 | $0.10 |

**Notes:**
- Rates shown above use the conservative $15 in / $75 out for Opus.
  Some plans (promotional or hybrid) may qualify for lower rates --
  one observed alternate is $5 / $25. Always verify current pricing
  for your account on
  [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  before quoting cost estimates to anyone.
- Opus 4.7 may produce ~35% more tokens than 4.6 for the same fixed
  text (tokenizer change) -- headline price parity hides a real cost
  increase.
- Batch API: 50% off both input and output for asynchronous jobs.
- US-only inference (`inference_geo`): 1.1x multiplier on Opus 4.6+.

**Subscriptions:**
- Pro: $20/mo (or $17/mo annual). Includes Claude Code with Sonnet
  floor.
- Max 5x: $100/mo.
- Max 20x: $200/mo. Roughly ~220K tokens per 5-hour window.
- Weekly quota cap added Aug 2025; separate Opus weekly cap.
- Auto Mode: not on Pro, Bedrock, Vertex, or Foundry.

---

## A worked example -- Standard mode, 1-hour session

You start a head session, deploy a super, super deploys two agents in
parallel for a feature build. All run on Standard: Opus 4.6 head at
high effort, Sonnet 4.6 super and agents at high effort. Cross-provider
spot-check is off (default).

**Approximate token shape (one session, well-cached):**

| Layer | Input tokens | Output tokens | Caching | Cost |
|---|---|---|---|---|
| Head (Opus, 1 turn) | ~30K (mostly cached) | ~3K | 90% hit on input | ~$0.40 |
| Super (Sonnet, 8 turns) | ~80K (well cached) | ~12K | ~85% hit | ~$0.35 |
| Agent 1 (Sonnet, 15 turns) | ~150K (mid cache) | ~25K | ~70% hit | ~$0.75 |
| Agent 2 (Sonnet, 15 turns) | ~150K (mid cache) | ~25K | ~70% hit | ~$0.75 |
| **Total** | | | | **~$2.25** |

Scaling that to a daily user running ~1 hour of this kind of work,
22 days/month: $2.25/session x 22 sessions = ~$50/mo well-cached.
Add 2-3x for poor cache or hot sessions with frequent rotation, and
the realistic monthly range is roughly $50-150/mo.

The same session in Pro mode (everything on Opus) lands closer to
$10-15 -- about 5x the cost. Whether that's worth it depends on
whether the Opus quality lift compounds over the session.

If cross-provider review fires on one agent's output (for example,
security-touching code in Agent 1), the cost of that reviewed work
roughly doubles -- the review pass adds approximately one execution
pass on the reviewed artifact. One agent reviewed in the example
above: ~$0.75 additional. Total session with one cross-check: ~$3.00.
Cross-check cost is bounded by trigger discipline, not session length.

---

## Anchoring expectations

- Budget-mode multi-agent orchestration is in the same order of
  magnitude as a single Cursor or Copilot subscription.
- Standard mode is roughly 3-5x that -- but it's when the
  orchestration pattern starts producing results that single-agent
  setups don't match.
- Pro mode is roughly 5x Standard -- best for sessions where the
  compound quality lift over many turns justifies the spend.
- Max mode with always-on cross-check is the most expensive
  configuration. Measure it on a bounded session before adopting
  it as a default.
- If you're under $5/day on Standard, you're probably not using the
  system enough to know if it's working. If you're over $50/day on
  Standard without a clear reason, something is inefficient --
  usually a poor cache hit rate, missing rotation hygiene, extended
  thinking enabled on tasks that don't need it, or a spot-check
  rate set too high.

The system rewards calibrated use. Run it deliberately, watch the
levers, and the cost stays predictable.

---

## Sources

- [Anthropic API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude.com pricing (subscriptions)](https://claude.com/pricing)
- [Prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Sub-agents docs](https://code.claude.com/docs/en/sub-agents)
- [Extended thinking docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Auto Mode (Claude blog)](https://claude.com/blog/auto-mode)
- [Fast Mode docs](https://code.claude.com/docs/en/fast-mode)
- [Claude Code costs guide](https://code.claude.com/docs/en/costs)
- [Cost and Usage Reporting in Console](https://support.anthropic.com/en/articles/9534590-cost-and-usage-reporting-in-console)
- [TROUBLESHOOTING.md entry 12 -- kill-switch / runaway protection]
