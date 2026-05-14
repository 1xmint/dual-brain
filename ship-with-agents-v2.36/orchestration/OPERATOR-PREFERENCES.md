# Operator Preferences

Durable operator truth for this live system.

Treat provider names, launchers, and surfaces in this file as current
operator-specific truth, not package-wide law for every installation.
When packaging for another operator, resolve the chosen runtime and launcher
from that operator's real setup instead of inheriting names like `Claude
terminal` by reflex.

Update this file when the operator states a repeated preference out loud and the
preference should survive beyond the current turn.

## Role Baselines

- Head baseline:
  `GPT/Codex desktop review-strategy lane on the surfaced strategy setting for
  that app` unless
  explicitly overridden for a specific task
- Manager baseline:
  `GPT/Codex desktop review lane on the surfaced strategy setting for that
  app` unless explicitly
  overridden for a specific task
- Super baseline:
  `claude-opus-4-6 / high`
- Agent baseline:
  `claude-sonnet-4-6 / high`
- Worker baseline:
  `claude-sonnet-4-6 / high`
- Brainstorm baseline:
  `strongest available strategy/review lane on the surfaced setting for that
  surface`; when
  launched in Claude terminal, default to `claude-opus-4-6 / high`

## Surface Truth

- Primary strategy/review surface:
  `GPT/Codex desktop app lanes` for head and manager by default
- Primary coordination surface:
  `current operator-chosen repo-connected coordination surface; in this live
  setup usually Claude terminal for super lanes`
- Primary execution surface:
  `current operator-chosen repo-connected execution surface; in this live
  setup usually Claude terminal for agent and worker lanes`
- Primary brainstorm surface:
  `desktop/app strategy lane` unless a terminal brainstorm is explicitly chosen

## Launch Environment Truth

- Preferred repo-connected terminal target:
  `VS Code terminal already rooted at <user-home>\the operator\Desktop\GitHub in this live
  setup`
- Working-directory expectation:
  `the repo-connected terminal usually already starts in the correct GitHub
  workspace root for launch commands; do not prepend Set-Location/cd by
  default`
- Launch command compactness preference:
  `when the current terminal root already satisfies access needs, prefer one
  bare launcher command block like claude --agent ... with no cwd prefix`
- Cwd-note preference:
  `if a cwd reminder is still useful, keep it in one short prose line outside
  the code block instead of embedding shell setup into the command`
- Prompt-artifact preference:
  `if raw prompt fallback is needed, keep exactly one launch command block and
  one startup prompt block; do not also advertise the durable prompt file
  unless it materially helps retry or review`
- Preference mutability:
  `treat launch/setup preferences as live truth that the operator can update anytime;
  when he says a repeated preference out loud, save it before the next launch
  recommendation`

## Budget And Escalation Truth

- Premium escalation permission:
  `ask first`
- "Ask first" models:
  `claude-opus-4-7` and any stronger premium-tier override above the baseline
- Cheapest acceptable execution default:
  `claude-sonnet-4-6 / high`
- Coordination baseline preservation:
  `do not launch supers on the cheaper execution model by default; if a super
  is going to run below the saved super baseline, require explicit setup truth
  or an explicit task/session override`

## Workflow Truth

- Default collaboration posture:
  `minimal user busywork, but user-guided workflow steering; chats should keep
  moving on bounded safe execution details while still recommending major
  routing/ownership moves for the operator to approve with a lightweight go`
- Approval-loop bias:
  `do not ask the operator to approve small internal transitions such as whether to
  write the next slice doc, relay to the manager, or convert review truth into
  the next exact artifact unless a real strategy/risk/policy boundary is being
  crossed`
- Relay preference:
  `prefer lane-to-lane wake, doc update, or exact handoff over asking the operator to
  manually shuttle half-finished internal approval steps`
- Steering preference:
  `for workflow-shape choices such as passing work to head/manager/super/agent,
  launching a new durable lane, reclaiming ownership, or escalating review
  depth, recommend one path and let the operator steer with "go", "ok", or
  "sounds good"`
- After-go rule:
  `once the operator approves the recommended workflow move, execute the bounded
  routing/launch/handoff directly without repeated approval asks`
- Lightweight approval normalization:
  `treat go / ok / sounds good / continue and obvious casual typo variants as
  the same lightweight approval when one prepared bounded move is clearly
  active; do not spend that approval on another summary-only turn`
- Desktop launch-mode preference:
  `from desktop/app chats, requests like "launch a supervisor/agent" default
  to producing the exact terminal launch packet only; do not auto-open a PC
  terminal, do not spawn a helper, and do not inject into the current terminal
  unless the operator explicitly asks for that launch mode`
- Launch-directness clarification:
  `after the operator says "go", "execute directly" means emit or route the exact next
  artifact immediately; for desktop launch requests that usually means the
  packet right now, not touching the terminal right now`
- Launch formatting preference:
  `prefer setup-resolved launch packets; do not present semicolon-chained shell
  glue as the default "clean" shape, and if prompt-file ingestion is not
  native or adapter-backed, prefer raw prompt plus final command`
- Launch environment fidelity:
  `when operator memory already says the repo-connected terminal is rooted
  correctly, do not add Set-Location/cd boilerplate or narrower repo cwd
  prefixes unless the command truly requires them`
- Non-courier rule:
  `a steering ask must not turn the operator into the transport bus when the current
  lane can route the handoff itself`
- Capability-first execution preference:
  `if a lane may be able to do the next step itself (git, GitHub, preview
  lookup, browser check, doc/state lookup, internal routing, or plugin-assisted
  action), verify and try that before asking the operator`
- Momentum preference:
  `when a live next owner still needs to pick up an active workstream and more
  production should likely continue now, prefer one tiny pickup trigger or one
  clear recommended next move over parking the lane with pure "No user action
  needed"; continuity alone is not enough if it predictably creates idle time`
- Desktop rotation preference:
  `desktop app chats should rotate proactively when long chat history starts
  causing app lag or whole-PC lag; preserve the same lane/owner/workstream,
  save checkpoints first, and generate a self-contained continuation prompt for
  the rotated chat`
- Role-to-lane preference:
  `treat roles as logical functions first and only open extra live lanes when
  the split buys real quality, speed, or clarity; do not spawn supervisor
  theater for tiny work`
- Plugin posture:
  `use installed plugins when they materially improve the task; suggest plugin
  installs only when the benefit is real and keep a portable fallback visible`
- Repo-scope preference:
  `when more than one repo or customer track is active, make repo scope
  explicit in routing truth and surface it visibly when implicit naming would
  confuse the user`
- Display-name preference:
  `desktop and app chat titles should use mission-first names in the shape
  Role - Product / Mission; avoid weak status/request titles like "assess X",
  "plan Y", or other transient verb phrases as the primary human-facing name`

## Support Truth

- Support posture:
  `shipping by default for ordinary execution; shift to guided when confusion,
  audit, or workflow friction is real; do not let speed turn the experience
  cold or under-explained`
- Explanation depth:
  `standard by default; expand when the operator is auditing, learning, or clearly
  sanity-checking the system`
- Reassurance preference:
  `yes, but only when it adds truth, clarity, or easier action`
- Jargon tolerance:
  `high if paired with plain-language framing first`
- Wants optional learning callouts:
  `yes, when they help confidence without slowing production`
- Confidence state:
  `exploring / builder mode; assume ambition plus experimentation rather than
  total certainty, but do not answer uncertainty with empty reassurance`
- Visualization preference:
  `yes when it materially improves clarity, especially tables, chunk maps, and
  small flow or lane diagrams in desktop-app surfaces`
- Doctor note preference:
  `yes; when a lane is confused, stalled, or needs a behavior correction, give
  the operator the exact doctor note to paste`
- Spoon-feeding preference:
  `yes; if the system can retrieve the PR link, preview URL, inbox truth,
  checkpoint state, or other next artifact itself, surface it directly and keep
  the remaining user step tiny`

## Temporary Overrides

- `2026-05-08 temporary premium-approved window: Claude usage resets tomorrow, so for the remainder of today use higher Claude models when there is real value, especially for quality/review work with high rework cost; prefer claude-opus-4-7 for code-quality audits, auth/trust review, architecture challenge, or expensive verification, but do not waste it on routine execution or decorative escalation`

## Memory Rule

- If the operator states a durable preference in chat, update this file before the next
  launch recommendation if the preference changes repeated behavior.
- If the preference is only for one slice or one session, store it as a
  temporary override or in the slice/handoff instead.
- If repeated friction suggests missing setup truth, run
  `orchestration/references/PREFERENCE-ONBOARDING-RULE.md` and save the concrete launch
  environment details here.



