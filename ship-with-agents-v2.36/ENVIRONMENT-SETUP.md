# Environment Setup

A one-time setup guide. Follow these steps to fill out
`orchestration/MODEL-CONFIG.md` so the orchestration system knows
your environment, providers, and budget. Takes about 15 minutes.

**Prerequisite:** You have at least one AI subscription or API key.

---

## Step 1: Your operating system

Which OS are you on?

- **Windows** — terminal commands use PowerShell or CMD syntax.
  Keyboard shortcuts differ from Mac.
- **Mac** — terminal uses zsh by default. Copy/paste in terminal
  works the same as in the editor (Cmd+C / Cmd+V).
- **Linux** — terminal uses bash or zsh. Similar to Mac for most
  commands.

Open `orchestration/MODEL-CONFIG.md` and fill in the **OS** field
under "Your Environment."

---

## Step 2: Your IDE and terminal

**IDE** (where you edit code):
- **VS Code** — most common. Claude Code runs in the integrated
  terminal at the bottom of the window.
- **Cursor** — VS Code fork with built-in AI. Claude Code still
  runs in the integrated terminal.
- **Terminal-only** — no IDE; you work directly in a terminal window.
- **Other** — JetBrains, Sublime, etc.

**Terminal** (where you type commands):
- **VS Code integrated terminal** — the panel at the bottom of VS
  Code. This is where Claude Code sessions run.
- **PowerShell** — default Windows terminal. Commands like `ls`,
  `cd`, `cat` work but some syntax differs from bash.
- **CMD** — older Windows terminal. Works but PowerShell is better.
- **bash / zsh** — Mac and Linux default. Most online tutorials
  assume this.

Fill in the **IDE** and **Terminal** fields in MODEL-CONFIG.md.

---

## Step 3: Your AI subscriptions

This is the most important step. Walk through each provider you use
and record what you have.

### Claude (Anthropic)

**How to check your plan:** Go to [claude.ai](https://claude.ai) →
Settings → Subscription. Or check your email for the most recent
Anthropic receipt.

**Plans and what they include:**

| Plan | Price | Claude Code | Models | Notes |
|------|-------|-------------|--------|-------|
| Free | $0 | No | Sonnet (limited) | Very limited daily messages |
| Pro | $20/mo | Yes (Sonnet) | Sonnet in Code; Sonnet + some Opus in Desktop | Good starting point. Sonnet handles most work. |
| Max 5x | $100/mo | Yes (model choice) | Opus + Sonnet + Haiku | ~50 Opus messages per 5-hour window |
| Max 20x | $200/mo | Yes (model choice) | Opus + Sonnet + Haiku | Higher Opus cap. Room for Opus on most roles. |
| Team | varies | Yes | Depends on org plan | Check with your admin |
| API direct | pay-per-token | Yes | All models | No message caps; cost scales with usage |

**How to check which models you can access:**
- In Claude Code: run `/model` to see your current model. Try
  `/model claude-opus-4-6` — if it works, you have Opus access.
- In Claude Desktop: click the model dropdown at the top of a chat.

**Common gotcha:** Claude Desktop's model dropdown may not show every
model available on your plan. Claude Code's `/model` command and
`~/.claude/settings.json` can access models the Desktop UI does not
list. If you expected to see a model and it is missing from the
dropdown, try setting it directly:

```json
// ~/.claude/settings.json
{ "model": "claude-opus-4-6" }
```

Or at runtime: `/model claude-opus-4-6`

**Fill in a Provider block** in MODEL-CONFIG.md with your Claude plan
details: name, plan, available models, limits, reset cadence, status,
and what it is best for.

### OpenAI (ChatGPT / Codex)

**How to check your plan:** Go to
[chatgpt.com](https://chatgpt.com) → Settings → Subscription.

**Plans:**

| Plan | Price | Codex | Models | Notes |
|------|-------|-------|--------|-------|
| Free | $0 | No | GPT-4o-mini (limited) | Very limited |
| Plus | $20/mo | Yes | GPT-4o, GPT-4o-mini, o3-mini | Weekly usage cap |
| Pro | $200/mo | Yes | GPT-4o, o3, o4-mini, extended | Higher caps |
| Team / Enterprise | varies | Yes | Depends on org | Check with admin |
| API direct | pay-per-token | N/A | All models | Use via code or proxy |

**Checking quota:** Settings → Usage or Billing. The weekly limit
error says "You've reached your usage limit" — it resets weekly
(usually Monday).

**Fill in a Provider block** in MODEL-CONFIG.md if you use OpenAI.

### Local models (Ollama, LM Studio, etc.)

If you run local models, you likely know your setup already. The key
detail for MODEL-CONFIG.md:

- **How it connects to Claude Code:** Set the `ANTHROPIC_BASE_URL`
  environment variable to point at your local endpoint. Claude Code
  will route requests there.
- **Model names:** Use whatever names your local server exposes
  (e.g., `qwen3-32b`, `llama-3-70b`).
- **Best for:** High-volume mechanical work at zero marginal cost.

Fill in a Provider block with your local setup details.

### Other providers (Cursor, Copilot, etc.)

Cursor and Copilot are IDEs with built-in AI, not standalone
providers. If you use them alongside Claude or GPT:

- List them as a provider in MODEL-CONFIG.md
- See `TOOL-TRANSLATION-GUIDE.md` for how to apply the orchestration
  system's concepts in these tools

---

## Step 4: Your skill level

Three levels — pick the one that fits:

- **New to AI tools** — You are learning as you go. You may not be
  sure what a "model" or "terminal" is. The system will give you
  more detailed instructions and point you to QUICK-REFERENCE.md
  when commands are involved.
- **Comfortable** — You know the basics of your tools. You can find
  menus, run commands, and navigate files. The system assumes you
  can follow instructions without step-by-step hand-holding.
- **Power user** — You know your tools well. You prefer concise
  instructions and skip introductory explanations.

Fill in the **Skill level** field in MODEL-CONFIG.md.

---

## Step 5: Your dispatch table

Now that you know your providers and models, fill in the dispatch
table in MODEL-CONFIG.md. This tells the system which provider and
model to use for each role.

**Quick guide to each role:**

| Role | What it does | Model guidance |
|------|-------------|----------------|
| Head | Strategy and priorities | Your strongest model |
| Super | Build coordination (deploy agents, track work) | Can be one tier lower than head |
| Agent | Bounded execution (one task at a time) | Your cost-effective model |
| Brainstorm | Deep thinking and idea exploration | Your strongest model |

**Fallback chain:** What happens when your primary provider is maxed
or rate-limited? Write 2-3 fallback steps. Example:

> 1. Opus rate-limited → drop to Sonnet on same provider
> 2. Claude entirely unavailable → switch agents to GPT
> 3. All providers down → pause and wait for reset

See MODEL-CONFIG.md for a filled-in example dispatch table. Fill in
your own table and fallback chain.

---

## Step 6: Pick your default mode

The system uses four cost modes: Budget, Standard, Pro, and Max.
Each mode sets the model strength and effort level across all roles.

**If you are not sure which mode to use:** start at **Standard**.
It is the cost sweet spot for most work — strong enough for real
development, affordable enough for daily use.

For the full decision tree, see `BUDGET-GUIDE.md`.

To declare your mode at session start, tell any chat:
"We're running Standard mode this session."

---

## Step 7: Verify your setup

Run these checks to confirm everything works.

### Claude Code

Open a terminal and run:

```
claude --version
```

If this fails, Claude Code is not installed. See
[docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code)
for installation.

Start a test session:

```
claude --model claude-sonnet-4-6 --effort standard
```

Inside the session, verify:

```
/model              # shows your current model
/effort high        # changes effort level
/cost               # shows session cost + cache stats
```

If `/model claude-opus-4-6` returns an error, your plan may not
include Opus access. Check Step 3 above.

### Claude Desktop

Open a new chat. Click the model dropdown at the top. Confirm you
see the models you expected from Step 3. If a model is missing, see
the settings.json workaround in Step 3.

### ChatGPT

Open a new chat. Check the model selector. Confirm you see your
expected models. If you have Codex access, check that it is available
under your plan.

### General check

Pick any START file (e.g., `orchestration/START-SUPER.md`) and
follow its instructions to launch a session. Confirm:
- The model matches what you configured in the dispatch table
- The effort level is what you expected
- The session starts without errors

If something does not work, check `TROUBLESHOOTING.md`.

---

## Done

Your MODEL-CONFIG.md is now filled out. The orchestration system
reads this file at the start of every session to know your
environment, providers, and dispatch preferences.

**Update MODEL-CONFIG.md when:**
- You change your subscription plan
- You add or remove a provider
- A provider's status changes (maxed, expired, reactivated)
- You want to shift your default mode

**Next steps:**
- Read `START-HERE.md` for a guided introduction to the system
- Read `orchestration/QUICK-START.md` to start using the
  orchestration layer
- See `QUICK-REFERENCE.md` for a command cheat sheet
