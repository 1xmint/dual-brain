# Collaboration Loop

Use this file when manager and super both touch the same meaningful work.

This exists because "two brains" is not the same as real collaboration.

Bad pattern:

- manager assigns
- super obeys
- user becomes the real reviewer

Better pattern:

- manager challenges
- super responds with operational judgment
- both refine the plan or packet
- launch or closeout happens only after explicit agreement or explicit disagreement
- the final delivery artifact is pressure-tested too, not just the analysis

Also use `orchestration/EXECUTION-ROUTING-GATE.md` so the slice loop stays between the
right lanes and does not drift upward to head by habit.

## Core Truth

The manager is not a foreman.
The super is not a packet typist.

The manager should independently challenge.
The super should independently reason, push back, and refine.

If one side assumes the other side already checked everything, the system is not
collaborating. It is performing collaboration theater.

For execution-shaped slices, the default dual-brain pair is:

- manager = challenge/review brain
- super = operational slice owner

Head should usually sit above that loop unless strategy, approval, or
escalation is actually needed.

## When This Loop Is Mandatory

Run the collaboration loop when any are true:

1. assurance level is `A2` or `A3`
2. launch-readiness has caution triggers
3. the work is cross-repo or infra-dependent
4. auth, signing, trust, money, schema, or release surfaces are involved
5. the verification path is ambiguous or expensive to get wrong
6. the manager and super disagree on routing, packet shape, or quality

## Required Loop

### Step 1: Super states verified view

Super should say:

- verified state
- proposed next move
- top risks or ambiguities
- what still needs independent challenge

### Step 2: Manager challenges specifically

Manager should not just say "do this" or "looks good."

Manager should challenge:

- contradictions
- stale claims
- missing prerequisites
- blocked verification
- hidden quality or architecture risks
- whether the assurance level is too low

### Step 3: Super responds as a collaborator

Super should do one of:

- agree and revise
- disagree and explain why
- narrow the disagreement
- escalate because the packet or outcome is still not trustworthy

Do not collapse into silent compliance.

### Step 4: Manager resolves the decision

Manager should state one of:

- `Approved as revised`
- `Revise before launch`
- `Continue with fixes`
- `Escalate because we still disagree`

Do not bounce one bounded technical tightening to the user for arbitration if
the collaboration pair already has a clear recommended fix.

### Step 5: Challenge the delivery mode

Before the result leaves the loop, both sides should pressure-test the tail:

- should this be a doc update instead of free prose?
- should the next move stay in the same chat?
- should this end as `No user action needed:` because the transition is still
  internal?
- if another chat must act, is there an exact copy block?
- if a launch is needed, is the startup body complete and the command last?
- is the user still being forced to act like a transport layer?
- is this actually a real user-owned decision, or should one of us convert it
  into the next exact artifact now?

Use `orchestration/references/TRANSPORT-CHOICE-GATE.md`.
Use `orchestration/REAL-USER-DECISION-GATE.md`.

### Step 5.5: Challenge owner momentum

Before yielding, ask:

- does the current owner still owe the next substantive review or routing step?
- is `Continue here with:` being used as a polite stall?
- could the current owner take the next step now instead of making the user
  poke the lane again?

Use `orchestration/.claude/skills/continuity-pickup/SKILL.md`.

### Step 5.6: Challenge lane ownership

Before launching or closing the next lane, ask:

- who is the current operational owner?
- is the higher layer only approving, or actually reclaiming ownership?
- is the next launch/closeout being emitted by the right owner?

Use `orchestration/LANE.md`.

### Step 6: Preserve the collaboration result

The final packet, routing call, or closeout note should reflect the agreed
state, not the first draft.

## Output Shape For Meaningful Collaboration

When this loop runs, both sides should make the exchange explicit.

Minimum useful shape:

```text
Collaboration status:
- Assurance level:
- Super proposal:
- Manager challenge:
- Super response:
- Outcome:
```

## Anti-Patterns

- manager as command issuer
- super as obedient packet generator
- manager approving without saying what was checked
- super revising without saying what changed
- either side accepting a vague delivery tail with no exact next artifact
- either side handing the user a soft reminder instead of taking the next owned
  step
- either side surfacing an internal transition as a user-facing approval moment
  when no real user action is needed
- a higher layer silently doing a lower owner's routing or closeout work
- both sides assuming the other did the hard check
- user being the first real sanity check
- head and manager iterating the slice while the actual super owner is idle
- super doing agent work instead of supervising execution

## Final Rule

If the work is important enough to justify two brains, it is important enough
for both brains to exercise independent judgment.



