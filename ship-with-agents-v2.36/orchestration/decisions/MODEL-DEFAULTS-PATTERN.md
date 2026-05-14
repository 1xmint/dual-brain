# Model Defaults Pattern

**Status:** Active
**Introduced:** Pass 10a
**Audience:** Solo dev on Claude Max ($100/mo) + Codex ($20/mo)
**Complements:** `decisions/SUBSCRIPTION-ROUTING-PATTERN.md`,
`.claude/skills/model-and-budget/SKILL.md`,
`.claude/skills/provider-routing/SKILL.md`

---

## Why this pattern exists

Pass 9.1 usage data showed 1,936 Opus turns vs. 632 Sonnet turns — 96% of
API-equivalent spend was on Opus. The majority of those Opus turns were
routine coordination, deployment sequencing, and sweep work that does not
require Opus-grade reasoning.

**This is not about dollar savings.** The user is on Claude Max — actual
charges do not scale per-token. The real benefits of right-sizing model choice
are:

1. **Quota headroom** — staying further from Max plan ceilings means more
   compute available for genuinely hard problems when they arise
2. **Speed** — Sonnet is approximately 30% faster than Opus on most turns;
   routine coordination work feels snappier
3. **Context efficiency** — Sonnet produces shorter outputs on average, leaving
   more headroom before `/compact` is needed in long sessions
4. **Quality preservation** — Opus is reserved for decisions where its
   reasoning advantage actually shows up; using it on routine routing work
   does not improve the routing decisions

---

## Default model per role

| Role | Default | Rationale |
|---|---|---|
| head | `claude-opus-4-6` | Strategic decisions, value/risk weighing, hard prioritization; Opus reasoning advantage is real here |
| manager | `claude-sonnet-4-6` | Routine challenge/review work; escalate when production-shaping decisions arise |
| super | `claude-sonnet-4-6` | Routine deployment coordination and sequencing; escalate for architectural choices |
| doctor | `claude-sonnet-4-6` | Routine sweeps and audits are Sonnet-class; escalate for deep architectural pressure-tests |
| agent | `claude-sonnet-4-6` | Already Sonnet; execution work is well-served by Sonnet |
| worker | `claude-sonnet-4-6` | Already Sonnet; bounded task execution is Sonnet-class |

Head specifically retains Opus because it sits at the junction of strategic
direction, value sequencing, and irreversible routing choices. Getting those
decisions right is where Opus reasoning actually matters. All other roles
default Sonnet and escalate to Opus only when a genuine trigger fires.

---

## Escalation triggers

A role should escalate to Opus when **any one** of the following is true:

- The work touches auth, credentials, payments, crypto, or other
  trust-sensitive code
- The decision shapes a long-lived architectural choice (cluster merge, role
  redefinition, cross-workstream contract)
- A previous turn revealed a non-obvious failure mode that needs deeper
  reasoning to root-cause correctly
- The user explicitly says "use Opus for this" or "/upgrade-model opus"
- The role is doing systemic root-cause analysis rather than a routine sweep
- The output will become a durable pattern file, ADR, or gate that governs
  future system behavior
- The recommendation being formed will be hard to reverse once acted on

If none of these conditions are true, stay on Sonnet.

---

## How to escalate

**Mid-session (same chat):** Type `/upgrade-model opus` with an optional
reason. The command documents the escalation intent and asks the user to
re-launch the chat with Opus if the current session is on Sonnet. If already
on Opus, the command confirms that.

**At-spawn (launch override):** When deploying a manager, super, or doctor
for a task that already meets an escalation trigger, launch with the explicit
model flag:

```
claude --agent manager --model claude-opus-4-6 --effort high -n manager-<N>-<slug>
```

This overrides the role card default for that session only. The role card
default remains Sonnet for future ordinary spawns.

**Note:** Claude Code does not support mid-session model switching at the
API level. The `/upgrade-model` command documents intent and guides the user
through the re-launch path; it does not perform a live model swap.

---

## Connection to existing skills

This pattern is downstream of two existing skills:

- `model-and-budget` skill: chooses model tier (Opus/Sonnet/Haiku) and
  justifies budget impact. This pattern provides the **default table** and
  **trigger list** that the skill uses as its starting state.
- `provider-routing` skill: chooses which provider (Claude Code vs. Codex).
  These are sequential decisions: pick provider first, then apply this
  pattern to pick model tier within that provider.

Load `model-and-budget` when budget justification is the real question.
Load `provider-routing` when the provider selection is the real question.
This pattern answers: "given we are on Claude Code, what model should this
role start on?"

---

## Anti-patterns

**Routing by "Opus is just better"** — Opus being capable of better reasoning
does not justify using it by default. The question is whether the specific
task actually benefits from that reasoning advantage. Routine coordination
work does not.

**Escalating without documented trigger** — Escalation should cite a specific
trigger from the list above. "Felt like it needed Opus" is not a documented
trigger. This discipline keeps escalation honest and the data meaningful.

**Using Opus to compensate for a weak task packet** — If a task packet is
underspecified, the fix is to clarify the packet, not to upgrade the model.
Opus does not rescue poorly scoped work.

**Never escalating** — The trigger list is real. Trust-adjacent code,
architectural ADRs, and systemic root-cause analysis genuinely warrant Opus.
Staying permanently on Sonnet for those decisions underserves the workstream.

---

## Real data context

Pass 9.1 rollup (API-equivalent, not actual Max plan charges):

- Opus: 1,936 turns / $710 API-equivalent (96% of spend)
- Sonnet: 632 turns / $24 API-equivalent (4% of spend)

The 96%/4% split reflects a system where all coordination roles defaulted to
Opus. The target posture after this pattern is applied: Opus turns should be
a smaller fraction concentrated on genuinely hard decisions, with Sonnet
handling the bulk of routine coordination, review, and sweep work.
