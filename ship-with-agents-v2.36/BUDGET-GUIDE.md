# Budget Guide

How to pick the right cost mode and switch between them.

---

## Step 1: Do you have your providers set up?

Before picking a mode, you need to know what you are working with.
Open `orchestration/MODEL-CONFIG.md` and fill in the **Strategy
layer**, **Coordination layer**, **Execution layer**, and **Research
layer** sections. If you have not done that yet, do it now -- the rest
of this guide depends on knowing which models and providers you have
access to.

---

## Step 2: What kind of work are you doing?

Use this decision tree to pick a mode:

```
What kind of work?
|
|-- Mechanical bulk (formatting, renames, file moves, manifest cleanup)
|   --> Budget
|
|-- Clear-spec development (features, bug fixes, docs, known patterns)
|   --> Standard
|
|-- Active development with judgment calls (architecture, design, ambiguity)
|   --> Pro
|
|-- Security, novel architecture, release-critical, expensive to reverse
    --> Max
```

If unsure, start at **Standard**. It is the cost sweet spot for most
work. Shift up or down when the work changes character.

---

## Step 3: What each mode does

The four modes control which model strength runs at each role. The
exact model depends on your providers -- see
`orchestration/MODEL-CONFIG.md` for the full mapping.

| Mode | Coordination (head/super) | Execution (agent/subagent) | Cross-provider review | When to use |
|------|----------------------------------|---------------------------|----------------------|-------------|
| **Budget** | Cost-effective model, medium effort | Cheapest model, low effort | Never | Mechanical bulk -- formatting, file moves, manifest cleanup |
| **Standard** | Cost-effective model, high effort | Cost-effective model, medium effort | Off by default; spot-check available | Clear-spec work -- features, docs, bug fixes |
| **Pro** | Strongest model, low effort | Cost-effective model, medium effort | On request + auto for security/legal/irreversible | Active dev with judgment calls |
| **Max** | Strongest model, high effort | Strongest model, high effort | Always for commit-grade changes | Security, novel architecture, release-critical |

The full model + effort matrix is in `orchestration/MODEL-CONFIG.md`.

---

## Quality lane vs budget mode

These are related, but they are not the same dial.

- `QUALITY-ROUTING-GATE.md` decides how much review structure the work
  needs: `Q0`, `Q1`, `Q2`, or `Q3`.
- `BUDGET-GUIDE.md` decides how expensive that work should be within
  your current provider and budget setup: `Budget`, `Standard`, `Pro`,
  or `Max`.

Common pairings:

- `Q0` usually fits `Budget` or `Standard`
- `Q1` usually fits `Standard` or `Pro`
- `Q2` usually fits `Pro` and sometimes `Max`
- `Q3` usually wants `Pro` or `Max`, plus independent review when the
  stakes justify it

Choose the quality lane first, then choose the cheapest budget mode
that still supports that lane honestly.

---

## Telling your chat to shift modes

Say any of these to any role in the system:

- **"Save usage"** / **"go cheaper"** / **"drop a tier"** -- the role
  shifts down one mode and tells you what changed.
- **"Higher pass"** / **"upgrade this"** / **"go Max on this"** -- the
  role recommends the right mode for the task and tells you how to
  switch in your environment.
- **"What mode are we on?"** -- the role names the current mode and
  whether it matches the work.

When runtime is visible or current-task truth is explicit, roles should
flag mismatches proactively: a strong model burning on mechanical work,
or a cost-effective model struggling on judgment-heavy audits. When
runtime is not visible, they should say so plainly and anchor on
project defaults instead of bluffing.

---

## How to switch models per environment

### Claude Code (terminal)

Per session (on launch for the current chat):
```
claude --model <current-chat-model> --effort high -n session-main
```

Default (persists across sessions) -- add to `~/.claude/settings.json`:
```json
{ "model": "<current-chat-model>" }
```

Runtime (mid-session):
```
/model claude-opus-4-6
/effort high
```

### Claude Desktop

Click the model dropdown in the chat UI. Switch between turns as
needed -- same chat, different model per phase.

### ChatGPT / OpenAI

Model selector in the chat UI or `model` parameter in API requests.

### API direct

Set the `model` parameter in your API request body:
```json
{ "model": "claude-sonnet-4-6" }
```

---

## Common provider combos

How the modes map for different setups:

**Claude Pro only ($20/mo):** Sonnet is your only model. Budget and
Standard are your everyday modes. Pro and Max still work -- they use
higher effort levels on the same model. For stronger reasoning, add a
second provider or upgrade your plan.

**Claude Max ($100-200/mo):** All four modes are available. Opus for
coordination in Standard+, Sonnet for agents. Max 5x users should
watch Opus window limits; Max 20x has room for Opus everywhere.

**Claude + OpenAI:** Claude for execution (Sonnet agents), GPT for
strategy or cross-check review. Standard: GPT-4o head + Sonnet agents.
Pro: Opus head + Sonnet agents + GPT cross-check on security. Max:
Opus everywhere + GPT always-on review.

**Local + cloud:** Local models for Budget/Standard bulk work, cloud
provider for Pro/Max judgment and cross-check. Zero marginal cost on
the local side keeps total spend low.

---

## The principle

Right-mode from the start beats upgrade-after-the-fact. Launching an
agent at Pro then discovering it needs Max wastes the Pro tokens.
Launching at Max for mechanical work wastes the Max premium.

The decision sequence:
1. Classify the work (mechanical / standard dev / trust-adjacent /
   novel-critical).
2. Pick the mode that matches.
3. Launch at that mode.
4. Shift mid-session only when the work changes character.

---

## Relationship to COSTS.md

The four mode names (Budget / Standard / Pro / Max) are the same ones
used in `COSTS.md`. COSTS.md describes cost expectations, review
policies, and the quality dial at each mode. This guide describes the
decision process and concrete switching commands. Same names, two
views of the same system.
