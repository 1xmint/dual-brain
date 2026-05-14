# Launch

Use this whenever a lane is being proposed, packetized, launched, confirmed, or
described to the user.

## Core Truth

`Launch` is not one action.

It can mean:

1. prepare a terminal launch packet
2. spawn a desktop/background helper directly
3. inject text into an already-running terminal
4. confirm that a launched lane is actually alive and registered

Do not collapse planning, packet preparation, runtime start, and confirmed live
ownership into one blurry event.

## Step 1: Resolve Intent And Container

Before acting on `launch`, resolve:

1. what role is being launched
2. what surface/container is actually desired
3. whether the buyer wants a packet, direct spawn, or terminal injection
4. whether the current surface can honestly perform that workflow
5. whether the target terminal is uniquely known
6. whether the chosen container can honestly support the expected role behavior

Also read:

- `OPERATOR-ORCHESTRATION-PROFILE.md`
- `SURFACE-CAPABILITY-PROFILE.json`

## Container Compatibility

Choose the role first, then choose a compatible container.

Default compatibility:

- durable `manager` lanes prefer a desktop strategy/review surface
- durable `super` lanes prefer a repo-connected terminal coordination surface
- durable `agent` execution lanes prefer a repo-connected execution surface
- `doctor` may live on either a strong desktop audit surface or a strong
  terminal audit surface depending on the issue

A desktop background helper is not automatically the same thing as a terminal
supervisor.

Before calling a spawned helper a real durable lane, verify:

1. repo-connected execution or coordination access
2. durable identity the system can resolve later
3. inbox and mailbox compatibility
4. active-map registration path
5. lane capsule support
6. ability to carry the expected role behavior on that surface

If those are not true yet, describe it honestly as a helper, not as a fully
launched durable lane.

## Step 2: Choose The Launch Mode

The safe default from a desktop strategy/review lane is usually a terminal
launch packet, not a silent helper spawn and not direct terminal injection.

Prefer:

- `terminal packet` for meaningful terminal-first roles like `super` and durable
  execution `agent` lanes
- `direct spawn` only when the buyer clearly wants a surface-native helper
  workflow and the container is genuinely compatible
- `terminal injection` only when the buyer explicitly asked for the current
  terminal or the target terminal is uniquely resolved

Requests like `launch a supervisor`, `launch the agent`, or `go ahead` do not
by themselves count as permission to open, focus, or type into the buyer's
terminal.

## Launch Preference Memory

When stable launch preferences are already known, treat them as defaults:

- preferred terminal target
- preferred launch mode
- role-specific defaults
- whether the terminal is already rooted correctly

Do not ask or guess the same launch-mode question every time, but do not let
remembered preference override an explicit request.

## Step 3: Shape The Launch Packet

When the chosen mode is a terminal packet, keep the launch artifact easy to run
and hard to misunderstand.

Resolve the transport shape in this order:

1. native launcher support for prompt-file ingestion
2. verified operator-specific launcher adapter
3. portable fallback with separate startup body and launch command

Do not improvise brittle shell glue just to preserve the illusion of one action.

If operator memory already says the terminal is rooted correctly, keep the code
block to the bare launcher command and move any cwd reminder into short prose.

## Launch Sequencing

Match artifact order to runtime reality.

Classify the launch path as one of:

1. `file-ingest`
2. `interactive-launch-first`
3. `prompt-first`

Use:

- file-ingest: short instruction, optional prompt-file note, one final launch
  command
- interactive-launch-first: short instruction, launch command block, then one
  startup prompt block labeled as the next paste into the launched session
- prompt-first: only when the target runtime truly expects the prompt body
  before the launch step

Do not force one universal block order.

## Step 4: Check Launch Readiness

Before telling the user to launch a new manual agent chat, ask:

- is this packet actually launch-ready?
- should it go straight to the user, or get independent preflight review first?
- is the launch shape easy to run, or did formatting bloat turn it into a
  user-hostile packet?

Common failure classes:

- contradictory instructions
- unverified prerequisites
- auth, signing, or trust paths the worker cannot actually exercise
- blocked verification paths
- stale repo-state claims presented as facts
- packet steps that skip build or compile reality
- launch formatting that duplicates the prompt or hides the real action

Caution triggers:

1. cross-repo or multi-system
2. real infra dependency
3. auth, signing, or trust surface
4. ambiguous verification
5. prerequisite contradiction
6. state claim not freshly verified
7. high cost of being wrong

Default rule:

- zero caution triggers: usually launch directly
- one trigger: tighten the packet and decide whether the fix is obvious
- two or more triggers: normally get independent preflight review
- auth/signing/trust plus another trigger: require independent preflight review

If independent preflight review is required, run `COLLABORATION-LOOP.md` before
the user launches anything.

Before a manual launch, say one of:

- `Launch readiness: ready`
- `Launch readiness: revise before launch`
- `Launch readiness: requires independent preflight review`

## Step 5: Track The Real Launch State

Allowed launch states:

- `planned`
- `packet_ready`
- `launched_unverified`
- `active`
- `closed`

Rules:

- `planned`: lane is justified, but no final packet or spawn exists yet
- `packet_ready`: exact launch artifact is ready, but runtime has not started
- `launched_unverified`: start was attempted, but confirmation is not present
- `active`: runtime start is confirmed and the lane can honestly own work
- `closed`: lane ended cleanly

A lane is not fully launched when only the chat or packet exists.

For meaningful lanes, full launch should also imply:

- role chosen
- compatible container chosen
- identity resolved
- active-map row written truthfully
- mailbox and inbox provisioned if required
- lane capsule created
- workstream linkage recorded

## Step 6: Prevent Phantom Lanes

Do not mark a lane `active` just because the packet is good.

If launch mode is terminal packet, parent-side scaffolding files are pending
supporting truth, not proof that the child exists yet.

Better a clearly pending lane than a fake active one.

## Step 7: Confirm The Launch

Any of these can confirm launch honestly:

- the buyer says the launch ran
- the launched lane writes inbox, mail, or checkpoint truth
- startup self-check evidence appears
- the parent verifies that the child is running on the intended surface

Until confirmation is real, keep the lane at `packet_ready` or
`launched_unverified`.

## Strong Behavior

- distinguish packet vs spawn vs injection explicitly
- preserve buyer choice of terminal when that choice is still open
- keep the packet copy-safe
- use the runtime session id or stable lane key in launch commands, not the
  buyer-facing display title
- keep stable lane, routing id, mission, scope, and non-goals intact
- keep the launch packet small when canonical truth already lives in the slice
- announce partial launch honestly when registration or confirmation is still
  missing

## Weak Behavior

- hearing `launch` and silently choosing a different workflow
- calling a helper container a fully launched durable lane by habit
- forcing giant launch blobs when a smaller packet would work
- hiding shell glue inside a brittle one-liner and calling it clean UX
- writing active-map truth before real start
- treating failed or partial terminal injection as successful launch
- claiming a lane is running because a command was shown

## Final Rule

Launch should be an atomic, truthful workflow event, not a chat-only event and
not a packet-writing ritual.
