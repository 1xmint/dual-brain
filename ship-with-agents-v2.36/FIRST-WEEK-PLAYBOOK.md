# First Week Playbook

Use this when you want the package to feel calm, legible, and fast in the
first week instead of becoming another smart system you have to babysit.

This file is written for three audiences at once:

- a noob vibe coder
- an experienced developer
- a model or tool lane that needs to know what truth to trust

It should also work for three support styles:

- "just move fast"
- "guide me a bit"
- "teach me while we do it"

## The Short Version

Good first-week usage looks like this:

1. pick the lightest safe setup
2. bootstrap it
3. run the doctor
4. do one real task
5. only add more structure when actual friction earns it

Do not try to "fully adopt the whole package" on day one.

## If You Are A Noob Vibe Coder

Start with:

- `CHOOSE-YOUR-SETUP.md`
- `START-HERE.md`
- one bootstrap script
- the doctor
- one real task

What to ignore at first:

- most orchestration gates
- multi-lane fanout
- dual-brain review
- heavy customization

What good looks like after day one:

- `AGENTS.md` exists
- your local/runtime folders exist
- the doctor is green or only lightly yellow
- one real task completed without you hunting through chat history for repo
  truth

If the package starts feeling bigger than the work, simplify back down.
If the package feels cold or too control-plane-heavy, shift into a more guided
support posture instead of assuming the structure itself is wrong.

## If You Are An Experienced Developer

Your fast path is:

- `CHOOSE-YOUR-SETUP.md`
- `bootstrap/README.md`
- bootstrap
- doctor
- skim `PLATFORM-SETUP.md`
- decide whether you actually need orchestration

What to ignore unless earned:

- deep orchestration
- closeout packets on trivial work
- dual-brain review on every task

Use the package for:

- durable repo memory
- repeatable handoffs
- upgrade-safe runtime separation
- trustworthy checkpoints and closeout

Not for:

- ceremony theater
- redundant chats
- abstract architecture cosplay

## If You Are The Model Or Tool Lane

Trust the smallest relevant truth source first.

Typical order:

1. repo `AGENTS.md`
2. `_agent-system-local/OPERATOR-PREFERENCES.md`
3. `_agent-system-local/INSTALL-CONFIG.md`
4. runtime truth:
   - `_agent-system-runtime/ACTIVE-WORKSTREAMS.md`
   - slices
   - checkpoints
   - closeouts
   - update bus
5. only then broader system defaults

Do not treat old chat memory as the system of record if a file already exists
for that truth.

## What Healthy Looks Like

### After 10 minutes

- bootstrap ran
- doctor ran
- folder shape makes sense
- you know whether you are in lightweight or orchestration mode

### After the first real task

- repo truth lived in docs, not only chat
- if the task was meaningful, there is a checkpoint
- if the task was tiny, you did not over-orchestrate it

### After the first week

- local preferences are filled out
- repeated quirks have a local home
- the user knows when to compact, rotate, resume, or relaunch
- active workstreams are not ghosts

### Long-term

- vendor updates do not overwrite runtime or local truth
- slices/checkpoints/closeouts are easy to inspect
- the update bus reduces note-pasting
- the doctor still says the install is healthy

## Red Flags

These are the strongest signs the setup is drifting:

- the user cannot tell which mode they are in
- the same truth exists in several chats but no file owns it
- orchestration was installed but nobody uses slices/checkpoints
- lightweight mode is still doing giant manual transport chores
- active maps or active workstreams are obviously stale
- the user is afraid to upgrade because everything is mixed together
- every task gets dual-brain review whether it needs it or not

## When To Stay Lightweight

Stay lightweight when:

- one strategy/review lane is enough
- execution work is bounded
- handoffs are occasional
- you can still trust `AGENTS.md` plus task packets

## When To Graduate To Orchestration

Upgrade when:

- multiple active workstreams need routing
- one task keeps crossing planning, review, launch, and closeout
- you need durable checkpoints or migrations
- chat transport is becoming the real work
- you need a super to manage safe fanout

## When To Simplify Back Down

Simplify if:

- there is only one real workstream again
- slices are being created but not used
- the operator is spending more time maintaining lanes than shipping
- review layers are symbolic instead of useful

## Weekly 5-Minute Maintenance Loop

Once the system is live, a good weekly habit is:

1. run the doctor
2. skim active workstreams
3. close ghost lanes
4. move meaningful finished work into closeout truth
5. record one useful quirk, lesson, or win if it actually repeated

That is enough for most solo operators.

## Final Rule

The package is healthiest when:

- the visible workflow is simpler than the internal architecture
- the user can tell what to ignore
- the interaction style matches the user's confidence
- and every extra layer earns its keep in speed, quality, or trust
