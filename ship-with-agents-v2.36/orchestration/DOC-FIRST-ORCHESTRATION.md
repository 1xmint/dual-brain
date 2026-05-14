# Doc-First Orchestration

Use this when copy-paste packets are starting to feel like manual transport
instead of a real system.

## Core Truth

Chat text is commentary.
Docs are truth.

But an artifact written somewhere is not automatically delivered to the live
lane that should absorb it.

The canonical work artifact should live in a durable file that multiple chats
can review, refine, launch from, and close out against.

Before drafting new scope, recommendations, or launch packets, first ask
whether a canonical slice, review memo, plan doc, checkpoint, or workstream
story already exists and is near enough to the problem to reuse.

## Why This Is Better

Doc-first orchestration reduces:

- stale packet drift
- user copy-paste labor
- "which version is current?" confusion
- launch packets that silently diverge from review packets
- re-explaining the same workstream in every new chat

It also improves quality because both review layers can challenge the same
artifact instead of reacting to slightly different pasted packets.

It does not remove the need to distinguish:

- artifact drafted
- artifact stored durably
- artifact routed into the right live inbox/mail surface

## The Three Layers

Use each layer for what it does best:

- conversation layer = judgment, challenge, tradeoffs, decisions
- artifact layer = durable slice docs, review memos, checkpoints
- launch layer = tiny startup stubs that point to the artifact

Do not make the chat history carry what the artifact should carry.

## Canonical Work Objects

### 1. Slice doc

This is the main work object.

Use `slices/TEMPLATE.md` and store live copies in:

- `slices/`

The slice doc holds:

- scope
- owner
- status
- assumptions
- non-goals
- verification path
- launch target
- checkpoint path
- review decisions

The same template can represent:

- a `standalone` execution slice
- a `parent` slice that owns several child slices
- a `child` slice launched under a parent slice and super-owned fanout plan

When one larger effort wants safe throughput, prefer one parent slice plus
several child slices over one giant implementation packet.

### 2. Review memo

Use `reviews/TEMPLATE.md` when a second brain has a real challenge, approval,
or risk note worth preserving.

Store live copies in:

- `reviews/`

### 3. Checkpoint

The slice doc is the contract.
The checkpoint is the observed execution truth after work starts.

Store live copies in:

- `checkpoints/`

### 4. Decision or ADR

If the work changes durable system or product truth, promote the result into
the repo's decision layer instead of bloating the slice doc forever.

## State Model

Every slice should carry an explicit state:

- `draft`
- `in_review`
- `approved`
- `in_progress`
- `blocked`
- `paused`
- `done`
- `abandoned`

Read `SLICE-STATE-RULES.md` for the exact meanings.

## Launch Rule

Launch from the canonical doc whenever possible.

For larger workstreams:

- the parent slice is the supervision contract
- child slices are the real launch units
- one super may own multiple active child slices when the collision map is
  explicit

Good launch:

```text
Read `references/START-AGENT.md`.

This is agent chat s3-auth.
Canonical slice doc: slices/auth-phase-2.md
```

Then put the launch command in its own code block at the end.

If a live launch owner already exists and the canonical slice is already
current, do not create another giant packet just to move from review to launch.
Wake the owner lane and let it re-read the slice.

If the current lane cannot edit the canonical doc directly, the response should
still end with an explicit `Update this doc:` block instead of vague prose
about what the doc should probably say.

Bad launch:

- giant packet pasted into every new chat
- packet v3 in one place and v4 in another
- user manually reconciling the difference
- creating a fresh scope story while ignoring an existing slice, plan, or
  review memo that already carries most of the truth
- saying a manager or supervisor "has the note" when the note only exists as a
  separate doc and was never routed into that lane's actual runtime surfaces

## Review Rule

Manager/head/super collaboration should happen against the same slice doc.

That means:

- challenge sections get added to the doc or a linked review memo
- approvals or revision requests change the slice status explicitly
- `launch_ready` becomes a field, not a vibe
- once the slice is approved for supervised execution, the final child launch
  artifact belongs to the launch owner, usually the super

Also read `orchestration/references/REVIEW-TO-LAUNCH-GATE.md`.

## Ownership Rule

One lane owns the canonical edit at a time.

Reviewers can comment, challenge, or stamp the slice, but the active owner
should be explicit so two chats do not silently compete to define the truth.

## Upgrade-Safe Rule

Do not store live slice docs in the replaceable vendor layer.

Use:

- `repo-ops-starter-pack/orchestration/` for shipped templates and guidance
- `OPERATOR-PREFERENCES.md` and `OPERATOR-CAPABILITIES.md` for durable
  operator-specific overrides and quirks in this live repo
- `updates/`, `reviews/`, `checkpoints/`, `closeouts/`, `logs/`, `lanes/`,
  and `observability/` for live state in this repo

## When To Still Use A Plain Task Packet

A plain task packet is still fine when:

- the work is tiny
- there is only one execution chat
- no second-brain review is needed
- the user wants the fastest possible transport

For non-trivial multi-chat work, prefer a canonical slice doc.

For non-trivial multi-slice work, also read
`orchestration/MULTITASKING-THROUGHPUT-GATE.md` so the system chooses between:

- one slice
- parent slice plus child slices
- one super lane
- or several independent supers

Use `orchestration/references/TRANSPORT-CHOICE-GATE.md` so the response ends with one exact
next-action artifact instead of another transport chore for the user.
If another live lane already owns the next step and the doc truth is current,
prefer `Wake <live lane>:` over another large packet.

## Noob-Proof Default

If the buyer is unsure, tell them:

1. create one slice doc from `slices/TEMPLATE.md`
2. get that slice to `approved`
3. launch from the slice
4. close out against the same slice and checkpoint

Also remember: if the system already has a relevant slice, plan, review memo,
checkpoint, roadmap section, or workstream story, read that first and tighten
it before inventing a new packet.

That is the smallest doc-first loop that still feels professional.

For tiny runtime-artifact refinements, also read `orchestration/DOC-UPDATE-PROTOCOL.md`
so the nearest tool-capable coordination lane edits the slice directly instead
of making the user shuttle a doc wishlist between chats.
If the current owner still owes the next slice judgment after a direct edit,
also read `orchestration/.claude/skills/continuity-pickup/SKILL.md` so the owner advances the work
instead of turning the user into a reminder loop.



