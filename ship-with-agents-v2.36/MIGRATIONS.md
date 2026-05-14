# Migrations

Use this file when a new package version introduces changes you may want
to adopt selectively instead of blindly replacing everything.

This file answers:

- what changed
- whether the change is required or optional
- where buyer-local truth should live
- what to do if you want only part of the new package behavior

## Migration Policy

Treat every new package change as one of these:

- `Required safety fix`
- `Recommended structural improvement`
- `Optional workflow upgrade`
- `Reference-only documentation improvement`

Do not assume every new version should overwrite your local behavior.

## v1.50 Migration Notes

### Recommended structural improvement

1. Adopt `orchestration/COLLABORATIVE-STEERING-GATE.md`.
2. Treat workflow-direction choices such as lane handoff, escalation,
   new-lane launch, and ownership transfer as a distinct middle category:
   buyer-guided, but not courier-driven.
3. Prefer `Recommended next move:` when the lane has one clear recommendation
   and the buyer should steer with `go`, `ok`, or `sounds good`.
4. After the buyer approves the recommended move, execute the bounded routing
   or launch directly without another approval loop.
5. Keep `Decision needed from buyer:` for genuine high-stakes or value-laden
   decisions, not simple recommended handoffs.

## v1.49 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. Adopt `orchestration/ACTIVE-PICKUP-TRIGGER-GATE.md`.
2. Treat routed inbox/update-bus truth as continuity, not proof that the next
   live lane has actively resumed.
3. If a passive live lane still needs a human nudge before work continues now,
   do not end with `No user action needed:`.
4. Keep the internal routing, then surface one tiny pickup trigger such as:
   - `Paste this into <session-id> (<role>): Read your inbox, then continue.`

### Optional workflow upgrade

- use the new passive-inbox rule when auditing dual-brain speed and coordination
  quality
- refresh any local custom prompts that still equate "routed internally" with
  "work will resume now"

## v1.48 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If your onboarding still assumes buyers already know words like `slice`,
   `lane`, `checkpoint`, or `closeout`, adopt:
   - `orchestration/PLAIN-LANGUAGE-GATE.md`
   - updated front doors such as `README.md`, `START-HERE.md`,
     `FIRST-30-MINUTES.md`, and `CHOOSE-YOUR-SETUP.md`

2. Translate internal words on first use:
   - `slice` -> main work doc
   - `lane` -> chat or work thread
   - `checkpoint` -> save point / latest status file
   - `closeout` -> final wrap-up record

3. Accept buyer synonyms without correction:
   - plan / spec / brief / work doc -> `slice`
   - chat / thread / session -> `lane`
   - status note / save point / resume note -> `checkpoint`

4. Keep internal words available for precision, but do not make them an
   onboarding prerequisite.

### Optional workflow upgrade

- use the plain-language gate whenever a buyer is new, not technical, or did
  not use the internal jargon first
- rely on the new fixture checks so the shipped package cannot silently drift
  back toward insider-only language
- update Claude-native role definitions too if you rely on `.claude/agents/`
  rather than only the markdown prompt files

## v1.47 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If your lanes still emit `Steps for you` even when the buyer has no real
   action, adopt:
   - `orchestration/USER-INTERRUPTION-THRESHOLD.md`
   - updated `orchestration/head-prompt.md`
   - updated `orchestration/super-reference.md`

2. Treat visible action tails as conditional on one of:
   - real buyer decision
   - real blocker
   - meaningful outcome that should be surfaced now

3. If none of those are true, prefer:
   - internal progression
   - durable routing
   - `No user action needed:`

### Optional workflow upgrade

- use the new interruption-threshold rule as the top-level smell test for
  whether a response is tidy but still buyer-hostile
- rely on the new fixture checks to catch regressions back toward mandatory
  `Steps for you` formatting

## v1.46 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If your live lanes still ask the buyer to carry wakes between already-live
   chats, adopt:
   - `orchestration/UPDATE-BUS.md`
   - `orchestration/WAKE-AND-CONTINUE-GATE.md`
   - `orchestration/OPERATOR-ACTION-OWNERSHIP-GATE.md`
   - `orchestration/TRANSPORT-CHOICE-GATE.md`

2. Treat these as different things:
   - buyer action
   - internal lane-to-lane routing
   - awareness-only state reporting

3. If a live lane can write the next owner's runtime inbox or equivalent
   durable routing artifact, prefer:
   - update canonical truth
   - route internally
   - report `No user action needed:`

### Optional workflow upgrade

- teach active supervisors/managers to use runtime inbox routing for existing
  live-lane handoffs instead of buyer-carried wakes
- rely on the new fixture checks to catch regressions where the package drifts
  back toward manual wake transport

## v1.45 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If your lanes still surface internal coordination transitions as buyer work,
   adopt:
   - `orchestration/TRANSPORT-CHOICE-GATE.md`
   - `orchestration/OPERATOR-ACTION-OWNERSHIP-GATE.md`
   - `orchestration/ACTIVE-OWNER-MOMENTUM.md`
   - `orchestration/COLLABORATION-LOOP.md`

2. Treat these as different outcomes:
   - real buyer action needed
   - no buyer action needed
   - internal lane-to-lane routing

3. If the next move is bounded and safe, default to progress:
   - current lane proceeds
   - or the current lane wakes/routes the correct owner
   - or the lane reports `No user action needed:`

4. Do not ask the buyer to approve writing the next bounded implementation
   slice unless a real strategy, release, budget, or durable-policy boundary is
   being crossed.

### Optional workflow upgrade

- use `No user action needed:` for awareness-only state changes that do not
  require transport, approval, launch, or paste work
- add local examples or team norms showing review-to-launch as an internal
  transition instead of a buyer-facing checkpoint
- rely on the new fixture checks to catch autonomy regressions before release

## v1.44 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If your orchestration lanes still decide when to compact, checkpoint, or
   close mostly by intuition, adopt:
   - `orchestration/COMPACTION-CADENCE-LOOP.md`

2. If meaningful checkpoints exist, populate the continuity fields now:
   - `Last verified at`
   - `Freshness window`
   - `Terminal status`
   - `Pickup confidence`
   - `Resume risk`
   - `Lane state if stopping now`

3. If meaningful closeouts exist, make sure they explicitly carry lane-state
   cleanup:
   - `Lane state action`
   - `Active-workstreams action`
   - `Active-chat-map action`
   - `Expected next session`

4. If long-running or high-assurance lanes keep either over-logging or
   under-logging history, adopt:
   - `orchestration/CHECKPOINT-EVENT-THRESHOLDS.md`

5. If lanes are getting slower and noisier before anyone thinks to compact,
   adopt:
   - `orchestration/CONTEXT-TAX-HEURISTIC.md`

### Optional workflow upgrade

- update local checkpoint habits so evidence and stop boundaries trigger
  checkpoints more consistently
- use checkpoint-event logs more deliberately on `A2` and `A3` work instead of
  bloating the main checkpoint
- let doctor and fixture checks surface continuity drift early instead of
  waiting for a bad resume or weak closeout

## v1.43 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you use orchestration lane names actively, adopt:
   - `orchestration/NAMING-SCHEMA.md`

2. Separate these four layers explicitly:
   - visible chat title
   - stable lane key
   - progress metadata
   - continuation token

3. Use full-word stable lane keys for new lanes:
   - `head-1`
   - `doctor-1-package-audit`
   - `super-1-checkout-rollout`
   - `agent-12-checkout-api`
   - `worker-4-auth-test-fixes`
   - `brainstorm-3-pricing-options`

4. Use `--runN` and `--recoverN` only for continuity:
   - `agent-12-checkout-api--run2`
   - `agent-12-checkout-api--recover1`

5. Keep ownership and progress out of the lane key. Record them in fields such
   as:
   - `owner lane`
   - `phase`
   - `milestone`
   - `chunk`
   - `state`

6. Do not rename an active lane midstream just to satisfy the new style. Finish
   the current lane or wait for a natural planned rotation, then switch the
   next fresh lane to the new scheme.

### Optional workflow upgrade

- map old shorthand to the new model when opening fresh lanes:
  - `h1` -> `head-1`
  - `Doctor1` may stay visible as a buyer-facing title, but use
    `doctor-<N>-<slug>` as the stable lane key
  - `s1-auth` -> `super-1-auth-rollout` or `agent-12-auth`, depending on the
    lane's real role
  - `a2-cache` -> `agent-12-query-cache`
  - `r2` -> `--run2`
  - `.1` -> `--recover1`
- refresh launch snippets, active-map templates, and closeout/checkpoint
  examples together so one old compact example does not keep teaching the wrong
  model
- let the doctor and fixture checks prove the install is clean instead of
  relying on memory

## v1.38 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If review lanes keep asking the user to approve small technical tightenings
   instead of converting them into the next exact artifact, adopt:
   - `REAL-USER-DECISION-GATE.md`

2. Treat these as different things:
   - real user-owned decisions
   - bounded reviewer-owned technical fixes

3. If the lane already has a clear recommended fix and no strategy, budget,
   public-release, or durable-preference boundary is changing, default to the
   next artifact instead of asking the user to bless it.

### Optional workflow upgrade

- teach review lanes to end with `Update this doc:`, `Wake ...`, or exact patch
  blocks more often
- reduce ceremonial approval loops for solo vibe coders while preserving
  quality gates

## v1.37 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If buyers now have optional subscriptions or paid surfaces that should be
   suggested when helpful, adopt:
   - `CAPABILITY-AWARENESS-GATE.md`
   - `templates/OPERATOR-CAPABILITIES.md`

2. Record durable capability truth in
   `_agent-system-local/OPERATOR-CAPABILITIES.md` instead of hoping live lanes
   remember it from old chat history.

3. If a new capability should change how active lanes think, publish it
   through the update bus in addition to updating the capability file.

### Optional workflow upgrade

- use capability memory for Replit Core, future remote-session hosts, or other
  paid execution surfaces
- make startup synthesis explicitly ask whether a relevant optional surface is
  being ignored

## v1.36 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If Replit will become more than a one-off sandbox and may later host
   long-running cloud AI sessions, adopt:
   - `REMOTE-SESSION-BRIDGE.md`

2. Require Replit and future remote-session runs to return local package truth
   through:
   - checkpoint
   - closeout when meaningful
   - update bus only when lane behavior actually changes

3. Treat remote cloud AI sessions as normal lanes with ownership, stop
   conditions, and return artifacts, not as a magical second coordination
   system.

### Optional workflow upgrade

- use `templates/REMOTE-SESSION-HANDOFF.md` for future remote cloud sessions
- use the Replit module as a clean path for hosted demo and auth/DB work while
  preserving local doc-first truth

## v1.35 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you now have access to Replit Core and want to use it without creating
   truth drift, adopt:
   - `REPLIT-INTEGRATION.md`
   - `REPLIT-COST-GATE.md`
   - `START-REPLIT-SANDBOX.md`

2. Keep the package's local docs as canonical truth and treat Replit as a
   bounded execution, demo, auth, or database surface.

3. Require every meaningful Replit run to return one clear local artifact:
   - checkpoint update
   - closeout update
   - or explicit inconclusive result

### Optional workflow upgrade

- use `templates/REPLIT-HANDOFF-TEMPLATE.md` for bounded cloud lanes
- use Replit for demo/publish/auth/DB leverage without turning it into a second
  orchestration system

## v1.34 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If terminal lanes keep producing user-facing copy blocks even when a live
   app-lane coordinator already exists, adopt:
   - `OPERATOR-ACTION-OWNERSHIP-GATE.md`

2. Separate these three layers more explicitly:
   - canonical doc truth
   - execution report
   - buyer-facing operator action

3. Let terminal lanes prefer:
   - slice/checkpoint/review updates
   - wakes
   - execution reports
   and let the highest active coordination lane with good UX surface the final
   buyer-facing action when one is actually needed.

### Optional workflow upgrade

- add `operator_action_owner:` to live slice docs
- use app-lane copy blocks as the default human interface when head or
  supervisory review lanes are already active
- avoid decorative copy blocks when a wake or status report is enough

## v1.33 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If reviewed execution keeps producing awkward manager-to-super relay
   packets, adopt:
   - `WAKE-AND-CONTINUE-GATE.md`
   - `REVIEW-TO-LAUNCH-GATE.md`

2. Treat supervised execution as a single launch-owner boundary:
   - review lane updates approval truth
   - super owns the final child-agent launch or blocker

3. If a canonical slice already exists and the next step belongs to an
   already-live lane, prefer `Wake <session-id> (<role>):` over another large
   pasted packet.

4. Stop inventing extra launch states unless your local slice system actually
   defines them. Prefer:
   - `status: approved`
   - `launch_ready: yes`

### Optional workflow upgrade

- record `launch_owner:` and `launch_mode:` in live slice docs
- use wake artifacts as the default cross-lane handoff when durable doc truth
  already exists

## v1.32 Migration Notes

### Required safety fix

1. If you use the shell bootstrap path for orchestration installs, refresh it
   so `_agent-system-runtime/` also gets:
   - `checkpoint-events/`
   - `closeouts/`
   - `updates/`

Older shell-created installs may look healthy at first while still missing the
newer runtime structures that later docs and doctor checks expect.

### Recommended structural improvement

1. Add `FIRST-WEEK-PLAYBOOK.md` to your real onboarding order if new users or
   helper lanes keep either over-adopting the system too early or keeping too
   much truth in chat.

2. Treat the doctor as part of normal installation, not optional cleanup after
   something already feels wrong.

3. Use the playbook's "when to stay lightweight / when to graduate / when to
   simplify back down" rules as the main long-term cleanliness check.

### Optional workflow upgrade

- stronger shell-first onboarding parity
- more explicit weekly maintenance loop for solo operators
- clearer model/tool-lane truth ordering for resume and recovery

## v1.31 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. For meaningful work, especially `A2` and `A3`, add a canonical closeout
   packet instead of relying only on slice + checkpoint + chat history.

2. Keep checkpoints as the latest execution snapshot, but add
   `checkpoint-events/` when the lane is long-running enough that overwritten
   checkpoint history would be a real loss.

3. Populate the new checkpoint freshness fields so future resumes and closeouts
   can distinguish active, stale, and low-confidence pickup states more
   honestly.

### Optional workflow upgrade

- use closeout packets only on meaningful lanes while keeping A0/A1 solo lanes
  fast and lightweight
- wire closed workstreams into `closeouts/` even when the checkpoint itself
  stays in place as the stable resume artifact

## v1.30 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you edit shared orchestration files, manifests, sync maps, or other
   cross-linked package docs, switch to staged verified chunks by default.

2. Apply the edit flow in this order:
   - core rule or canonical file
   - mirrored/shared files
   - metadata
   - release checks

3. Treat large one-pass edits as the exception for isolated low-risk surfaces,
   not the normal workflow for package surgery.

### Optional workflow upgrade

- explicitly explain "shared/cross-linked surface, so I’m staging this" when
  users would otherwise read the behavior as model weakness

## v1.29 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If larger workstreams keep moving one slice at a time, introduce parent
   slices and child slices instead of forcing a single giant execution packet.

2. Treat safe throughput as an active responsibility:
   - head looks for parallel workstreams
   - review brains challenge under-parallelization and over-parallelization
   - supers own child-slice fanout

3. Keep multiple supers for truly independent workstreams, not as a shortcut
   around a live super that could safely own the fanout itself.

### Optional workflow upgrade

- add explicit `parallel_safe`, `depends_on`, and `child_execution_lanes`
  fields to your live slice docs
- keep same-repo fanout to `1-2` live child slices unless owned surfaces are
  unusually clean and the collision map is explicit

## v1.25 Migration Notes

### Required safety fix

1. If you are using canonical slice docs with multiple live coordination lanes,
   add `ARTIFACT-CUSTODY-GATE.md` to your working rule set.

### Recommended structural improvement

1. Treat approval, operational ownership, and artifact mutation as separate
   authorities when a slice has a live owner.

2. If a higher layer can edit runtime docs directly, do not let that capability
   silently overrule the lower owner's canonical slice custody.

3. Update any custom prompts that currently let head or another higher layer
   rewrite a lower owner's slice tail or emit its launch by default.

### Optional workflow upgrade

- separate review memos from canonical slice mutation more explicitly
- use owner-targeted update blocks when approval should flow back down without
  reclaiming custody

## v1.26 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you are doing reviewed execution work, move the detailed slice loop to:
   - review brain + super
   instead of:
   - head + review brain

2. Treat super-owned execution as the default once the work wants supervision,
   checkpointing, or likely follow-up.

3. Keep direct agent launches as a deliberate exception for genuinely small,
   bounded packets.

### Optional workflow upgrade

- more explicit direct-agent exception policy
- stronger separation between phase approval and execution routing

## v1.27 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. Move copy blocks and startup bodies to the end of your responses, with the
   final executable command last.

2. Use clear labels for human-facing copy artifacts, especially:
   - `Copy This and paste into ...`
   - `Run this last:`

3. Treat delivery-tail presentation as part of workflow quality, not optional
   formatting polish.

### Optional workflow upgrade

- divider-style copy blocks for stronger visual emphasis
- stricter command-last habit across all manual launch flows

## v1.28 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you have multiple active lanes, move workflow propagation to the runtime
   update bus instead of repeated manual note-pasting.

2. Add `_agent-system-runtime/updates/` with:
   - `UPDATE-FEED.md`
   - `UPDATE-INDEX.md`
   - `UPDATE-WATERMARKS.md`
   - `inbox/`

3. Check for unread updates at:
   - startup
   - resume
   - major compact/rotation
   - before launch
   - before closeout

### Optional workflow upgrade

- lane-specific inbox routing
- must-read update gating for launches and closeouts
- watermark-based update checking instead of full rescans

## v1.23 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. Move your onboarding habit to:
   - `CHOOSE-YOUR-SETUP.md`
   - `bootstrap/README.md`
   instead of starting from the biggest docs first.

2. If you are using orchestration seriously, prefer a bootstrap-created
   safe-upgrade layout instead of hand-assembling:
   - `_agent-system/`
   - `_agent-system-local/`
   - `_agent-system-runtime/`

3. Run the doctor after install and after larger customizations so drift is
   caught earlier.

4. Treat canonical slice docs as the default truth for multi-chat work, not an
   optional advanced side path.

### Optional workflow upgrade

You may adopt these independently:

- selector-first onboarding
- bootstrap install scripts
- doctor health checks
- stronger doc-first default for multi-chat work
- cleaner public no-manager buyer language

## v1.24 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. If you have durable role/model preferences, move them out of chat history and
   into:
   - `_agent-system-local/OPERATOR-PREFERENCES.md`

2. Before trusting any launch recommendation, make sure the role is reading:
   - operator preferences
   - model config
   - runtime model truth

3. Re-run the doctor after adding orchestration or changing role baselines so
   missing preference memory is caught early.

### Optional workflow upgrade

- preference-memory habit for model and surface defaults
- temporary override tracking for one phase or one session
- more explicit buyer voice propagation across multi-chat orchestration

## v3.4 Migration Notes

### Required safety fix

None.

### Recommended structural improvement

1. Keep buyer-specific self-improvement out of replaceable vendor files.
   Move local lessons, wins, and enabled-module decisions into:
   - `_agent-system-local/LOCAL-QUIRKS.md`
   - `_agent-system-local/LOCAL-LESSONS.md`
   - `_agent-system-local/LOCAL-WINS.md`
   - `_agent-system-local/ENABLED-MODULES.md`

2. Start reading `CHANGELOG.md` before applying a new package version.

3. Use this file to decide whether you want all new behavior or only
   selected parts.

### Optional workflow upgrade

You may adopt any of these independently:

- package changelog habit
- migration-note habit
- enabled-modules pattern
- local lessons and wins files

You do not need to adopt every one at once.

## Selective Adoption Rules

If you want only some improvements from a new version:

1. Read `CHANGELOG.md` for the release summary.
2. Read the matching section here.
3. Decide which type each change is:
   - required
   - recommended
   - optional
4. Copy only the vendor files that support the changes you want.
5. Record your choice in `_agent-system-local/ENABLED-MODULES.md`.

## Local Override Truth

If you disagree with a shipped default, do not edit the vendor file
first.

Prefer:

- `_agent-system-local/INSTALL-CONFIG.md`
- `_agent-system-local/ENABLED-MODULES.md`
- `_agent-system-local/LOCAL-QUIRKS.md`
- `_agent-system-local/LOCAL-LESSONS.md`
- `_agent-system-local/LOCAL-WINS.md`

Only edit vendor files if you are intentionally forking the package.

## When To Fully Replace Vendor Files

Replace the vendor layer when:

- the changelog says the change is required or strongly recommended
- you want the new default behavior across the system
- your local config does not intentionally override that area

Do not replace blindly just because a newer zip exists.

## When To Hold Back

Hold back or selectively adopt when:

- the new change is workflow opinion, not safety-critical
- your team already has a stronger local version
- the change would disrupt active workstreams mid-project
- you need to finish a phase before changing routing or storage rules
## v1.50 Migration Notes

- Adopt `orchestration/COLLABORATIVE-STEERING-GATE.md`.
- Treat workflow-direction choices such as lane handoff, escalation, new-lane
  launch, and ownership transfer as a distinct middle category:
  buyer-guided, but not courier-driven.
- Prefer `Recommended next move:` when the lane has one clear recommendation
  and the buyer should steer with `go`, `ok`, or `sounds good`.
- After the buyer approves the recommended move, execute the bounded routing or
  launch directly without another approval loop.
- Keep `Decision needed from buyer:` for genuine high-stakes or value-laden
  decisions, not simple recommended handoffs.
