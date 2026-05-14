# Troubleshooting

Common AI-agent pain points mapped to pack solutions. If you are hitting one of these problems, the fix is already in the pack — this guide tells you where.

---

## 1. Agent edits files without permission

**Problem:** The agent modifies files you did not ask it to touch, adds features you did not request, or makes "improvements" outside the task scope.

**Why it happens:** Without explicit boundaries, agents optimize for helpfulness — which means doing more than asked. No stop-and-ask list means no guardrails.

**Which pack files solve it:**
- `templates/task-packet.md` — the **Out of Scope** section explicitly lists what the agent must not do.
- `templates/AGENTS.md` — the **Stop-And-Ask List** section defines actions that require human approval.
- `AGENT-WORKFLOW-GUIDE.md` — the **When The Agent Must Stop And Ask** section.

**Key principle:** *"An agent should stop and wait for you before anything hard to reverse."* — AGENT-WORKFLOW-GUIDE.md

---

## 2. Context goes stale in long sessions

**Problem:** The agent forgets constraints from earlier in the conversation, repeats earlier steps, or gives longer and less useful responses.

**Why it happens:** Every AI model has a finite context window. As the conversation grows, older instructions get pushed out or diluted. Quality degrades before the session visibly breaks.

**Which pack files solve it:**
- `templates/chat-migration-packet.md` — structured hand-off to a fresh session.
- `AGENT-WORKFLOW-GUIDE.md` — the **Migration Packets** section explains when and how to migrate.
- `templates/task-packet.md` — keeping each unit of work small reduces context pressure.

**Key principle:** *"When a chat starts to rot, migrate. Do not push through."* — AGENT-WORKFLOW-GUIDE.md

---

## 3. Cannot tell what is real in my repo

**Problem:** Shipped code, half-built features, old experiments, and stale brainstorms all live in the same directory. Nobody can tell what is canonical and what is dead.

**Why it happens:** AI-generated code accumulates fast. Without an inventory system, every file looks equally real.

**Which pack files solve it:**
- `templates/evidence-ledger.md` — labels every surface as shipped, partial, stale, superseded, or unknown.
- `CHAOS-CODE-RECOVERY-GUIDE.md` — step-by-step method for rescuing a messy codebase without a doomed "audit everything" sweep.
- `examples/chaos-recovery-walkthrough.md` — fictional example of the method in action.

**Key principle:** *"Do not ask an agent to audit the whole codebase. It will produce noise."* — START-HERE.md

---

## 4. Agent says done but it is not

**Problem:** The agent claims work is complete, but tests fail, features do not work, or files were not actually changed.

**Why it happens:** Agents are optimized to be agreeable. Without explicit done criteria, "done" means "I generated output," not "the change works."

**Which pack files solve it:**
- `templates/task-packet.md` — the **Done Criteria** section requires specific, checkable conditions.
- `AGENT-WORKFLOW-GUIDE.md` — the **Loop Closure** section.
- `templates/AGENTS.md` — the **Loop Closure Rule** requires concrete evidence, not just "done."

**Key principle:** *"An agent may not mark work done without concrete evidence: file path, diff, test output, or verified behavior."* — templates/AGENTS.md

---

## 5. Agent invents URLs, versions, or APIs

**Problem:** The agent confidently cites library versions that do not exist, links to URLs that 404, or describes API endpoints that were never real.

**Why it happens:** AI models generate plausible text, not verified facts. Work chats with repo access are especially dangerous because they mix real file reads with invented external knowledge.

**Which pack files solve it:**
- `AGENT-WORKFLOW-GUIDE.md` — the **Research Ownership** section separates what the work chat can answer (file contents, test output) from what it cannot (external facts, versions, prices).
- `PROMPT-PACK.md` — the research gate prompts route external questions to the strategy chat.

**Key principle:** *"The work chat is allowed to read files and run local commands. It is not allowed to be your source of truth about the outside world."* — AGENT-WORKFLOW-GUIDE.md

---

## 6. Agent ignores my architecture

**Problem:** The agent creates new files in the wrong directory, invents new patterns instead of following existing ones, or restructures code without understanding the project layout.

**Why it happens:** Without a documented architecture, the agent infers structure from whatever files it happens to read. Its inferences are often wrong.

**Which pack files solve it:**
- `templates/ARCHITECTURE.md` — documents what the repo owns, main components, data flow, and boundaries.
- `templates/AGENTS.md` — the **Repo Role** section prevents agents from misunderstanding what the repo is for.
- `REPO-DOCS-SYSTEM-TUTORIAL.md` — how to lay out docs so the agent can find canonical truth.

**Key principle:** Give the agent a map before asking it to navigate. `ARCHITECTURE.md` is the map.

---

## 7. Do not know when to start a new chat

**Problem:** You keep pushing through a long conversation because starting over feels wasteful. Quality keeps dropping.

**Why it happens:** Sunk-cost thinking. The conversation has useful history, so you do not want to lose it. But the agent is already losing it for you.

**Which pack files solve it:**
- `AGENT-WORKFLOW-GUIDE.md` — the **Migration Packets** section gives explicit signals for when to migrate.
- `templates/chat-migration-packet.md` — captures what the next session needs, nothing more.

**Signals to migrate:**
- The agent repeats earlier steps.
- Instructions from early in the chat are forgotten.
- Outputs get longer and less useful.
- The agent refers to work that was discussed but never actually done.

---

## 8. Agent makes breaking changes

**Problem:** The agent's changes break existing functionality — tests fail, imports break, or downstream code stops working.

**Why it happens:** The agent does not verify its own work against the full system. It sees the files it edited, not the files that depend on them.

**Which pack files solve it:**
- `templates/PR-readiness-checklist.md` — a before-you-merge checklist that catches breaking changes.
- `templates/task-packet.md` — the **Done Criteria** section should include "tests pass."
- `AGENT-WORKFLOW-GUIDE.md` — the **Human Checkpoints** section lists when you must personally verify.

**Key principle:** *"Before a merge: open the diff yourself or read the PR description. Do not merge based on 'the agent said it is ready.'"* — AGENT-WORKFLOW-GUIDE.md

---

## 9. Project is already a mess

**Problem:** You have an existing codebase that was built with AI help and it is out of control. You do not know what works, what is stale, or where to start.

**Why it happens:** AI can generate code faster than humans can review it. Without structure, the codebase becomes an archaeological site.

**Which pack files solve it:**
- `CHAOS-CODE-RECOVERY-GUIDE.md` — the full recovery method.
- `templates/evidence-ledger.md` — the inventory tool.
- `examples/chaos-recovery-walkthrough.md` — see the method applied to a fictional project.
- `START-HERE.md` — the **If you have an existing messy AI-coded project** section.

**Key principle:** *"Promote or replace one slice at a time, each through a small PR."* — START-HERE.md

---

## 10. Working with a team and agents conflict

**Problem:** Multiple people are using AI agents on the same repo. Agents step on each other's work, make contradictory changes, or duplicate effort.

**Why it happens:** Each agent session is isolated. Without shared conventions and a coordination layer, agents act independently even when working on the same codebase.

**Which pack files solve it:**
- `orchestration/QUICK-START.md` — multi-agent coordination system.
- `orchestration/HOW-IT-WORKS.md` — how the super layer prevents conflicts.
- `templates/AGENTS.md` — shared conventions that every team member's agent reads.
- `AGENT-WORKFLOW-GUIDE.md` — the **Team onboarding** section.

**Key principle:** Shared `AGENTS.md` + shared conventions + orchestration for coordination. Every team member reads `START-HERE.md` and `AGENT-WORKFLOW-GUIDE.md` first.

---

## 11. Agent hallucinates project state

**Problem:** The agent says "we already added X" or "the file at Y contains Z" when neither is true. It confuses discussed plans with completed work.

**Why it happens:** In long sessions, the boundary between "discussed" and "done" blurs. The agent's context includes both plans and executed work, and it cannot always distinguish them.

**Which pack files solve it:**
- `AGENT-WORKFLOW-GUIDE.md` — the **Loop Closure** section.
- `templates/task-packet.md` — the **Reporting** section requires concrete evidence of completion.
- `templates/AGENTS.md` — the **Loop Closure Rule** rejects "done" without proof.

**Fix in the moment:** When the agent claims something exists, ask it to show the file path, the exact content, or the command output. If it cannot, the work was not done.

---

## 12. Do not know where to start with this pack

**Problem:** The pack has a lot of files and you are not sure which ones matter for your situation.

**Why it happens:** The pack is comprehensive by design. Not every file applies to every situation.

**Which pack files solve it:**
- `START-HERE.md` — begin here, follow the order.
- `START-HERE.md` — the **Fast-Track for Experienced Developers** section if you already know git, PRs, and CI/CD.
- `README.md` — the **Recommended Path** section.
- `TOOL-TRANSLATION-GUIDE.md` — if you are not using Claude Code, start here to find your tool-specific setup.

**Quick answer:** Read `START-HERE.md`. Follow the order. Copy the templates you need. Skip the rest until you hit a specific problem, then come back here.

---

## 13. Wrong repo, wrong branch, or broken workspace state

**Problem:** The agent is in the wrong clone, wrong branch, stale workspace, or
otherwise invalid repo state. The first instinct is to throw the workspace away
and restart clean.

**Why it happens:** Restarting feels safe, but it can destroy valid work if you
skip the salvage step.

**Which pack files solve it:**
- `CHAOS-CODE-RECOVERY-GUIDE.md` - broader recovery method for messy or
  uncertain code state
- `templates/work-chat-handoff.md` - structured handoff when recovered work
  needs to be transferred into a clean lane
- `templates/chat-migration-packet.md` - preserves the next-step truth if the
  chat itself needs replacement

**Recovery rule:** Before recommending a restart, classify:
- invalid state
- recoverable work
- unrecoverable work

Then choose:
- transfer recovered work
- partially replay work
- full restart

**Key principle:** *"When the workspace is wrong, do not assume the work is
worthless. Salvage first, restart second."*
