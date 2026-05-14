# Changelog

All notable buyer-facing changes to this package are documented here.

This changelog is for humans. It is not a raw commit dump.

Package release tags now use `v1.xx` labels for the normalized public series.
Older `v2.x` and `v3.x` labels below are pre-baseline build history from the
package hardening phase.

## [Unreleased]

No unreleased buyer-facing changes yet.

## [v2.36] - 2026-05-10

### Added

- a new craft layer for code quality:
  `code-review`, `test-design`, `refactoring-patterns`,
  `error-handling`, `api-design`, `commit-hygiene`, and `patterns`
- stack-aware quality tooling via `scripts/detect-stack.ps1` and
  `scripts/run-quality-checks.ps1`
- project-learning capture via `/capture-pattern`,
  `patterns/README.md`, and the patterns skill
- friction logging via `/log-friction` and
  `decisions/FRICTION-AND-PATTERNS-PATTERN.md`

### Changed

- `/ship` and `/fix` now route through stack-aware quality checks before commit
- public orchestration indexes (`AGENTS.md`, `CLAUDE.md`) now surface the craft
  skills alongside the workflow and routing layer
- doctor sweep now reads friction and pattern surfaces when they exist

### Notes

- the quality runner is ecosystem-aware for Node, Python, Rust, and Go
- Python, Rust, and Go branches are included but were not runtime-smoked during
  this release pass

## [v2.35] - 2026-05-10

### Added

- six new workflow commands for vibe-coder flows:
  `/ship`, `/fix`, `/audit`, `/undo-last`, `/diff-session`, and
  `/pin-baseline`
- repo-scoped personal memory with `/remember`,
  `.claude/skills/personal-memory/SKILL.md`, and
  `.claude/memory/INDEX.md`
- cost visibility and quota-advisory routing surfaces via `/cost`,
  `provider-routing`, `config/model-rates.json`, `config/budget.json`, and
  supporting decision records
- `/upgrade-model` plus documented Sonnet-by-default role escalation rules for
  manager, super, and doctor

### Changed

- public orchestration control panels (`AGENTS.md`, `CLAUDE.md`) now surface
  personal-memory, provider-routing, and model-default guidance as part of the
  starter-kit layer
- head, manager, doctor, and super public role cards now reflect the newer
  model-default and escalation posture from the live system

### Notes

- spend figures from `/cost` are API-equivalent value, not your subscription
  bill
- cost tracking is Claude Code only; Codex and non-terminal Claude surfaces
  still require manual awareness

## [v1.96] - 2026-05-06

### Added

- `orchestration/THREAD-LOCAL-IDENTITY-PRIORITY-RULE.md`,
  `orchestration/SELF-NOTE-RECOGNITION-GATE.md`, and
  `orchestration/CURRENT-LANE-CERTAINTY-LADDER.md` so the system now treats
  strong thread-local continuity and obvious self-notes as first-class identity
  evidence instead of only knowing how to be cautious
- `orchestration/CAPABILITY-FIRST-EXECUTION-RULE.md` and
  `orchestration/SMALLEST-USER-EFFORT-RULE.md` so the system now treats
  "verify capability and try it yourself first" plus "reduce buyer effort to
  the tiniest honest step" as first-class workflow rules instead of optional
  good instincts
- `orchestration/AGENT-FRESHNESS-REUSE-GATE.md` so the system now treats
  still-fresh child-agent reuse as a first-class quality and efficiency rule
  instead of only a deep-reference hint
- `orchestration/PARENT-PICKUP-HANDHOLDING-RULE.md` so buyer-visible child
  completions now have a first-class rule for saying when a live parent can
  simply be nudged with `done` or `read your inbox` instead of making the user
  guess or relay raw terminal output
- `orchestration/THREAD-ADOPTION-CONFIRMATION-GATE.md` and
  `orchestration/SELF-REGISTRATION-GATE.md` so the system now distinguishes
  self-registration from real thread adoption and stops current chats from
  minting fake active manager/super identities by writing them into the map
- `orchestration/CONTINUATION-ADOPTION-GATE.md` so a fresh chat opened from a
  checkpoint, closeout, or rotation artifact now treats that source as
  first-class continuity truth instead of acting like the buyer still needs to
  paste it somewhere else
- `orchestration/PLUGIN-AWARENESS-GATE.md`,
  `orchestration/PLUGIN-INVENTORY.md`, `orchestration/PLUGIN-FIT-MATRIX.md`,
  `orchestration/PLUGIN-OPTIONALITY-RULE.md`,
  `orchestration/PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md`, and
  `orchestration/PLUGIN-PORTABILITY-GATE.md` so plugin and skill capability is
  now treated as a first-class workflow layer instead of a forgotten extra

### Changed

- identity-resolution, startup-self-check, wrong-lane safety, doctor hot path,
  role-card, and smoke-test surfaces now explicitly prevent the system from
  forgetting an obvious current-lane identity or misclassifying a self-authored
  rotation note as foreign
- hot-path guidance, capability notes, GitHub wrapper truth, buyer-labor
  rules, prompts, role cards, and smoke tests now explicitly challenge
  `when you have the link, send it here` style tails and require lanes to
  verify whether they can fetch PR state, preview state, inbox truth, or other
  next artifacts directly before asking the buyer
- public startup, prompt, identity, and naming surfaces now explicitly teach
  title-first continuation pickup on desktop/app chats, so the first visible
  line can set the chat title cleanly and fresh continuation chats self-adopt
  from their own checkpoint or rotation source
- manager, super, agent, hot-path, and smoke-test surfaces now explicitly
  challenge "fresh agent by habit" launches when the current child agent is
  still the better same-workstream execution container
- buyer-handholding, closeout, result-return, command, prompt, and smoke-test
  surfaces now explicitly force noob-friendly parent pickup guidance like
  `You can just say done to <lane>.` or `You can just say read your inbox to
  <lane>.` whenever live runtime truth already makes that enough
- hot-path guidance, head/manager/super role cards, prompt smoke tests, and
  doctor coverage now catch naming drift from self-registration and plugin
  blindness when a relevant installed or marketplace-available capability
  should change the recommendation
- buyer-facing naming now prefers the shortest honest current title, keeps the
  active chat unsuffixed, and reserves `(paused)`, `(superseded)`, and
  `(closed)` for visible non-current chats while routing ids stay backend
  continuity metadata

## [v1.87] - 2026-05-06

### Added

- `orchestration/SURFACE-CONTAINER-COMPATIBILITY-GATE.md` and
  `orchestration/LAUNCH-CONTAINER-RESOLUTION.md` so the system now separates
  lane role from launch container and treats "chat exists" as different from
  "lane is fully launched"

### Changed

- surface-capability truth, operator orchestration profile, lane-birth
  guidance, active-map freshness, spawn-decision rules, role-to-lane
  elasticity, head/manager hot path, doctor checks, and smoke coverage now
  catch background-helper-as-supervisor confusion and incomplete launch
  registration

## [v1.86] - 2026-05-06

### Added

- `orchestration/CONTINUE-UNLESS-REAL-BOUNDARY-RULE.md` and
  `orchestration/OBVIOUS-NEXT-STEP-AUTONOMY-GATE.md` so the system now treats
  premature `continue` loops as a first-class workflow failure instead of a
  soft UX nit

### Changed

- hot-path guidance, manager/super prompts, role cards, doctor classification,
  package manifest/sync, doctor checks, and smoke coverage now enforce the
  rule that obvious in-scope next steps should proceed without another tiny
  buyer nudge unless a real boundary exists

## [v1.85] - 2026-05-06

### Added

- `orchestration/MISSION-LOCK-GATE.md` and
  `orchestration/ADJACENT-WORKSTREAM-AWARENESS-GATE.md` so meaningful lanes now
  have explicit runtime gates for staying inside mission/scope/non-goals while
  still recognizing neighboring workstreams and owners

### Changed

- startup self-check, workstream-story truth, top-chain synthesis, manager and
  super hot paths, doctor checks, package manifest/sync, and smoke coverage now
  treat off-mission expansion and adjacent-owner drift as first-class failures
  instead of letting useful awareness silently widen lane scope

## [v1.84] - 2026-05-05

### Added

- `orchestration/RUNTIME-TERM-SEPARATION-RULE.md`,
  `orchestration/CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md`, and
  `orchestration/SURFACE-RUNTIME-TERM-MATRIX.md` so the system now separates
  internal support words from vendor runtime terms and verifies unstable
  capability claims before presenting them as truth

### Changed

- runtime-model, doctor, support-posture, doctor-check, and smoke-test paths
  now explicitly fail support-posture leakage like `Effort level: guided` and
  prefer surfaced or verified runtime truth over smooth guesswork

## [v1.83] - 2026-05-05

### Added

- `orchestration/BUYER-HANDHOLDING-COMPLETION-RULE.md` so buyer-visible
  completion outputs now require a plain `For you:` action block when any user
  action still remains
- `orchestration/SURFACE-AND-EFFORT-DISCLOSURE-RULE.md` so meaningful
  completion and handoff outputs now state surface and effort context instead
  of making users infer it

### Changed

- terminal-report conversion, guided-tail patterns, agent completion format,
  and manager/super/agent hot paths now enforce easiest-action-first buyer
  handholding, including `say done` or `read your inbox` when that runtime path
  is honestly valid

## [v1.82] - 2026-05-05

### Added

- `orchestration/RUNTIME-MAIL-PROTOCOL.md`,
  `orchestration/DONE-ABSORPTION-RULE.md`,
  `orchestration/FAN-IN-SYNTHESIS-RULE.md`, and
  `orchestration/MAILBOX-STATE-MODEL.md` so lanes can communicate upward
  through runtime mail instead of defaulting to buyer-carried transport
- `orchestration/mail/` runtime seeds and new commands for mailbox reads, mail
  delivery, child-completion absorption, and fan-in synthesis

### Changed

- inbox resolution now checks runtime mail before update inboxes, `done` now
  acts as a mailbox-absorption moment for coordination lanes, observability now
  tracks mail behavior, and bootstrap/doctor/fixture coverage enforce the new
  mail layer

## [v1.81] - 2026-05-05

### Added

- `orchestration/TERMINAL-REPORT-CONVERSION-RULE.md` so terminal completion
  reports now have an explicit rule for converting machine-facing execution
  truth into buyer-ready closeout truth when manager or super still owns the
  next control-plane step
- `orchestration/.claude/commands/convert-completion-to-closeout.md` for
  compact, repeatable terminal-report conversion

### Changed

- execution-to-closeout guidance, agent hot-path instructions, manager/super
  prompts, doctor checks, and smoke tests now enforce visible recipient versus
  intended recipient resolution, next-owner clarity, and exact bridge output
  instead of allowing polished direct-agent reports to strand the buyer

## [v1.80] - 2026-05-05

### Added

- `orchestration/INTERNET-AWARENESS-GATE.md`,
  `orchestration/RESEARCH-FRESHNESS-LADDER.md`,
  `orchestration/SOURCE-TIER-POLICY.md`,
  `orchestration/BIG-PICTURE-SCOUT-PASS.md`,
  `orchestration/SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md`,
  `orchestration/WEB-CAPABLE-LANE-ROUTING.md`, and
  `orchestration/EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md` so the package now has
  a first-class internet-smarts and external-research layer
- new commands for assessing freshness risk, scouting big picture, framing docs
  and security research, logging durable external evidence, and routing
  research to a web-capable lane

### Changed

- hot-path files, role cards, capability profiles, and observability starters
  now treat web-backed docs/security/market research as a deliberate quality
  multiplier instead of an accidental side capability

## [v1.79] - 2026-05-05

### Added

- `orchestration/TRUTH-BEFORE-ASSUMPTION.md`,
  `orchestration/RESOLVE-CLASSIFY-ACT.md`,
  `orchestration/ASSUMPTION-RISK-LADDER.md`,
  `orchestration/INFERENCE-LABELING-RULE.md`,
  `orchestration/VERIFY-BEFORE-ROUTING-GATE.md`, and
  `orchestration/TRUTH-SOURCE-PRIORITY.md` so the package now has one compact
  cross-role doctrine for when runtime truth must beat memory or theory

### Changed

- hot-path files, role cards, role prompts, stop hooks, and key coordination
  commands now explicitly distinguish known truth, inference, and missing truth
  instead of allowing risky routing or identity assumptions to hide inside
  fluent prose
- doctor and smoke-test surfaces now treat assumption failures as a first-class
  regression type rather than only a side effect of continuity drift

## [v1.75] - 2026-05-04

### Added

- `orchestration/SYSTEM-WORLD-MODEL.md`,
  `orchestration/WORKSTREAM-DEPENDENCY-GRAPH.md`,
  `orchestration/CROSS-WORKSTREAM-CONTRACTS.md`,
  `orchestration/NEIGHBOR-AWARENESS-CAPSULE.md`,
  `orchestration/CHANGE-EVENT-SCHEMA.md`,
  `orchestration/WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md`,
  `orchestration/REPLAN-TRIGGER-GATE.md`,
  `orchestration/ATTENTION-ROUTING-ENGINE.md`,
  `orchestration/SYSTEM-STORY-DIGEST.md`,
  `orchestration/CONFLICT-RADAR.md`,
  `orchestration/OPPORTUNITY-RADAR.md`,
  `orchestration/TOP-CHAIN-SYNTHESIS-LOOP.md`, and
  `orchestration/LIVE-HYDRATION-BOOTSTRAP.md` so the package now has a
  first-class shared-world-model and impact-propagation layer instead of only
  lane/workstream indexes
- Claude commands for `/trace-impact`, `/trace-dependencies`,
  `/refresh-system-story`, `/assess-conflicts`, `/assess-opportunities`, and
  `/brief-neighbors`
- a new collaboration rule for collective intelligence plus starter runtime
  files for `observability/impact-events.jsonl`,
  `workstreams/system-story.md`, and `workstreams/neighbor-digest.json`

### Changed

- head, manager, super, and doctor hot-path surfaces now explicitly think in
  terms of dependencies, neighbor cells, impact radius, conflicts, and
  opportunities instead of only local ownership and continuity
- active workstream, health, dashboard, and observability starter schemas now
  carry relationship and impact fields such as dependencies, shared contracts,
  last change event, impact radius, conflict detection, and opportunity
  detection
- doctor and fixture enforcement now fail when the shipped package loses the
  shared-world-model, impact-propagation, or collective-intelligence surfaces

## [v1.74] - 2026-05-04

### Added

- `orchestration/INTENT-COMPILER.md`,
  `orchestration/VISUALIZATION-DECISION-GATE.md`,
  `orchestration/PRESENTATION-MODE-LADDER.md`,
  `orchestration/VIBE-CODING-TRANSLATOR.md`,
  `orchestration/CHUNK-MAP-PROTOCOL.md`,
  `orchestration/LANE.md`,
  `orchestration/DESKTOP-APP-AFFORDANCE-GATE.md`, and
  `orchestration/SMART-NEXT-STEP-FRAMING.md` so the package now has a
  first-class intent-compilation, representation-choice, and
  desktop-visualization layer
- Claude commands for `/compile-intent`, `/choose-presentation-mode`,
  `/draw-lane-map`, `/draw-chunk-map`, and `/translate-vibe-request`

### Changed

- head, manager, super, doctor, and the hot-path collaboration rule now treat
  vibe-coded user language as valid input that should be compiled into smart
  structure rather than corrected into package jargon first
- desktop-app capable lanes now explicitly consider Mermaid diagrams, tables,
  chunk maps, and lane maps when they materially improve clarity
- operator preference truth now includes visualization preference alongside the
  support posture memory
- doctor scripts and fixture checks now fail if the shipped package loses the
  new intent-compiler or visualization surfaces

## [v1.73] - 2026-05-04

### Added

- `orchestration/USER-SUPPORT-PROFILE.md`,
  `orchestration/SUPPORT-POSTURE-GATE.md`,
  `orchestration/DOCTOR-NOTE-PROTOCOL.md`,
  `orchestration/ADAPTIVE-EXPLANATION-GATE.md`,
  `orchestration/USER-CONFIDENCE-MODEL.md`,
  `orchestration/LANE.md`,
  `orchestration/GUIDED-TAIL-PATTERNS.md`, and
  `orchestration/FAST-PATH-VS-TEACHING-PATH-RULE.md` so the package now has a
  first-class support, confidence, and guided-tail model instead of relying on
  scattered tone hints
- Claude commands for `/assess-support-posture` and `/draft-doctor-note` so
  lanes can quickly choose the right support mode and emit compact repair notes

### Changed

- head, manager, super, and doctor hot-path surfaces now explicitly adapt
  between shipping, guided, and teaching modes based on buyer confidence and
  intent
- operator preferences now carry durable support truth like explanation depth,
  reassurance preference, jargon tolerance, and doctor-note preference
- doctor scripts and fixture checks now fail if the shipped package loses the
  new support-posture, doctor-note, or adaptive-explanation surfaces

## [v1.72] - 2026-05-04

### Added

- `orchestration/DOCTOR-SWEEP-PROTOCOL.md`,
  `orchestration/LANE.md`,
  `orchestration/UNRESOLVED-ISSUES-REGISTER.md`,
  `orchestration/LANE.md`,
  `orchestration/ORPHAN-LANE-DETECTOR.md`,
  `orchestration/STATE-FRESHNESS-SLA.md`,
  `orchestration/TURN-EVENT-CAPTURE-POLICY.md`,
  `orchestration/FRUSTRATION-RESOLUTION-PROTOCOL.md`,
  `orchestration/DOCTOR-CONTROL-PLANE-DASHBOARD.md`, and
  `orchestration/CROSS-LANE-AWARENESS-RULE.md` so doctor now has a
  first-class survey, heartbeat, freshness, unresolved-issue, and
  cross-lane-awareness operating layer
- starter observability files for `heartbeats.json`, `lane-awareness.json`,
  `unresolved-issues.json`, and `doctor-dashboard.md`
- Claude commands for `/doctor-sweep`, `/detect-orphan-lanes`,
  `/score-lane-awareness`, `/log-frustration`, `/resolve-frustration`, and
  `/refresh-doctor-dashboard`

### Changed

- doctor startup, playbook, role card, and hot-path surfaces now explicitly
  require periodic system sweeps instead of relying on opportunistic review
- turn-outcome events and observability metrics now carry stronger identity,
  self-correction, frustration, freshness, and unresolved-issue signals for
  runtime quality diagnosis
- doctor scripts and fixture checks now fail if the shipped package loses the
  new sweep, heartbeat, unresolved-issue, or doctor-dashboard surfaces

## [v1.71] - 2026-05-04

### Added

- `orchestration/SELF-CORRECTION-OWNERSHIP.md` so the system now has an
  explicit rule that visible self-feedback must become correction, exact
  repair, or one explicit blocker before a lane stops

### Changed

- reflection, self-improvement, and collaboration hot-path surfaces now treat
  "I should have..." as a mandatory correction trigger rather than a nice
  retrospective sentence
- hot-path role cards for head, manager, super, agent, worker, and doctor now
  explicitly convert visible self-feedback into corrected behavior instead of
  commentary alone

## [v1.70] - 2026-05-04

### Changed

- doctor role surfaces now explicitly own bounded recovery for broken live
  lanes instead of allowing diagnosis-only stop points when repair is still
  possible
- `doctor-prompt.md`, `DOCTOR-PLAYBOOK.md`,
  `LIFECYCLE-REPAIR-PROTOCOL.md`, and the Claude doctor role card now require
  doctor to carry recoverable lane failures through to one of three honest end
  states:
  - working again
  - intentionally closed or superseded
  - one explicit blocker left outside doctor's safe custody

## [v1.69] - 2026-05-04

### Changed

- supervisor identity hot-path guidance now treats unresolved lane identity as
  a real failure mode instead of letting a lane pretend it cleanly checked an
  empty inbox
- buyer-facing recommendation and bridge surfaces now explicitly separate the
  human buyer from the next-owner lane so responses stop phrasing manager or
  supervisor routing ids as if they were the buyer
- `START-SUPER.md`, `super-prompt.md`, and related Claude commands now require
  lane inbox, lane capsule, and startup self-check truth before a supervisor is
  treated as truly live

### Fixed

- closed a regression where a manually launched supervisor could report "no
  actionable updates" even though it had never resolved to an active-map row,
  lane capsule, or inbox
- closed a recommendation leak where supervisor output could say findings route
  back to `you (m5.2r2)` even though the buyer was not the manager lane
- fixture coverage now fails if the shipped package loses the new
  lane-identity and buyer-boundary protections
## [v1.68] - 2026-05-04

### Added

- `orchestration/HEAD-DECISION-RUBRIC.md`,
  `orchestration/MANAGER-SUPER-AUDIT-RUBRIC.md`,
  `orchestration/TOP-CHAIN-ANTI-PATTERNS.md`, and
  `orchestration/HEAD-MANAGER-SCOREBOARD.md` so head and manager now have a
  first-class professional rubric for value judgment, supervisor challenge
  quality, and top-chain anti-pattern detection
- `orchestration/EXECUTION-COMPLETION-TO-CLOSEOUT-PROTOCOL.md` so the package
  now treats "build complete" as different from "workstream truly closed" and
  requires a real closeout transition
- `orchestration/BUDGET-AND-SUBSCRIPTION-ROUTING.md` so orchestration can make
  smarter choices when the operator's real subscription mix and budget posture
  materially change lane/provider shape
- Claude commands for `/assess-head-decision`, `/audit-super-review`,
  `/closeout-from-execution`, and `/resolve-budget-routing`
- `.claude/rules/55-top-chain.md` and `.claude/rules/60-budget-routing.md`
  so top-chain rigor and budget-aware routing are part of the shipped hot path

### Changed

- hot-path `AGENTS.md`, head/manager/super role cards, and head/manager/super
  prompt surfaces now explicitly load top-chain, closeout-transition, and
  budget-routing docs instead of leaving them as cold references
- observability starter schema and runtime health summary now carry stronger
  frustration, bridge, top-chain, budget-routing, and closeout-transition
  signals for doctor-quality audits
- doctor checks and fixture coverage now fail when the new top-chain,
  closeout-transition, or budget-routing surfaces disappear from the package

## [v1.67] - 2026-05-04

### Added

- `orchestration/IDENTITY-RESOLUTION-PROTOCOL.md`,
  `orchestration/LANE.md`,
  `orchestration/STARTUP-SELF-CHECK-GATE.md`,
  `orchestration/WORKSTREAM-STORY-MODEL.md`,
  `orchestration/LANE.md`, and
  `orchestration/LIFECYCLE-REPAIR-PROTOCOL.md` so meaningful lanes now have a
  first-class identity, birth, startup-check, story, and lifecycle model
- runtime starter directories for `lanes/` and `workstreams/`, including lane
  state and workstream story templates
- Claude commands for `/resolve-identity`, `/startup-self-check`,
  `/broker-lane`, `/refresh-workstream-story`, and `/repair-lifecycle`
- `.claude/rules/50-lane-awareness.md` so the hot path now treats missing lane
  identity, inbox, or registration as a real structural defect

### Changed

- head, manager, super, and doctor startup surfaces now explicitly resolve
  identity and run a startup self-check before substantive work
- hot-path `AGENTS.md`, `CLAUDE.md`, role cards, and lane sync guidance now
  point lanes toward lane brain capsules, workstream stories, and lane-broker
  logic instead of relying only on broad doc reading
- orchestration bootstrap, doctor checks, and fixture coverage now ship and
  verify the lane-awareness runtime layer so new lanes are harder to create in
  a half-born state

## [v1.66] - 2026-05-03

### Added

- `orchestration/DOCTOR-OBSERVABILITY-LAYER.md`,
  `orchestration/TURN-OUTCOME-EVENT-SCHEMA.md`,
  `orchestration/EVIDENCE-RETENTION-RULE.md`, and
  `orchestration/OBSERVABILITY-METRICS-MODEL.md` so doctor now has a
  first-class runtime evidence model instead of relying only on recollection,
  health summaries, and ad hoc quoted chat snippets
- runtime `observability/` starter files for structured turn events, selective
  evidence retention, and compact observability metrics
- Claude commands for `/log-turn-outcome` and `/assess-observability`

### Changed

- doctor startup, prompt, role-card, AGENTS, and CLAUDE surfaces now point
  lanes at runtime observability before trusting memory for workflow-quality
  audits
- orchestration health guidance now explicitly includes observability as a
  top-level quality signal
- bootstrap, doctor, and fixture systems now install and verify the
  observability layer as part of the shipped orchestration runtime

## [v1.65] - 2026-05-03

### Added

- `orchestration/EXECUTION-OWNER-REUSE-GATE.md` so the package now has a
  first-class rule for choosing between `direct agent`, `reuse live super`, and
  `new super`

### Changed

- manager and super prompt surfaces now explicitly require execution-owner
  reuse checks before proposing a fresh supervisor for the next seam of a live
  workstream
- hot-path role cards, review-state rule, spawn decision gate, execution
  routing gate, and role-to-lane elasticity guidance now all reinforce
  "reuse current execution owner first"
- doctor and fixture coverage now fail if the execution-owner reuse surface
  disappears from the shipped package

## [v1.64] - 2026-05-03

### Added

- `orchestration/EXECUTABLE-HANDOFF-BRIDGE-RULE.md` so recommendation-first
  routing now has a first-class rule for exact wake/paste/launch bridges when
  another live lane is the real next owner

### Changed

- head, manager, and super prompt surfaces now require `Bridge mode:` and an
  exact ready bridge artifact when the next move is not fully internal
- `RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md`,
  `COLLABORATIVE-STEERING-GATE.md`, `TRANSPORT-CHOICE-GATE.md`, and
  `PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md` now treat "route it to the
  manager lane" / "say the word" without the real packet as a structural flow
  defect
- `resolve-next-owner` now resolves bridge mode and whether a bridge artifact is
  needed, not only next-owner truth
- doctor and fixture coverage now enforce the new executable-bridge surface

## [v1.63] - 2026-05-03

### Added

- `orchestration/REVIEW-STATE-MACHINE.md`,
  `orchestration/BUYER-STEERING-VS-BUYER-LABOR-GATE.md`,
  `orchestration/RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md`,
  `orchestration/DEFAULT-RECOMMENDATION-RESOLUTION-RULE.md`,
  `orchestration/REVIEW-CELL-STATE-REGISTRY.md`, and
  `orchestration/PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md` so the package
  now models review state, recommendation state, next-owner truth, and
  buyer-steering versus buyer-labor explicitly instead of relying on delivery
  tails alone
- `orchestration/DUAL-BRAIN-COMMIT-PROTOCOL.md`,
  `orchestration/MULTI-BRAIN-TOPOLOGY.md`,
  `orchestration/TRI-BRAIN-DIVERSITY-GATE.md`, and
  `orchestration/PROVIDER-ROLE-BINDING-MATRIX.md` so dual-brain and optional
  tri-brain work now have a real provider/function binding model instead of
  decorative extra lanes
- Claude commands for review-state assessment, recommendation drafting,
  next-owner resolution, dual-brain health scoring, and topology choice
- fixture coverage and doctor checks for review-state automation surfaces and
  review-state health-schema fields

### Changed

- head, manager, and super prompt surfaces now require recommendation-first
  behavior on meaningful review/routing turns instead of tolerating raw
  buyer-owned ambiguity forks
- orchestration health and active-workstream models now carry explicit
  `reviewState`, `recommendationState`, `approvalState`, `nextOwner`,
  `pickupRequired`, and `buyerSteerRequired` fields
- Claude stop hooks now treat missing recommendation state and unresolved
  buyer-steering versus buyer-labor boundaries as false-done risk
- the package doctor now checks for the new review-state docs, commands, rule,
  and health-schema fields

## [v1.62] - 2026-05-03

### Added

- fixture coverage for legacy numbered buyer-facing titles so the doctor now
  catches regressions where shipped guidance drifts back toward `Head1 - ...`
  or `Manager5 - ...` style display names

### Changed

- buyer-facing naming is now mission-first across visible launch and onboarding
  surfaces, using `Role - Product / Mission` instead of number-first titles
- launch docs now teach examples like `Head - Portfolio / Priorities`,
  `Manager - App Core / Product Development`, `Supervisor - App Core / Feature
  Rollout`, and `Agent - App Core / Cache Fix`
- top-level onboarding docs now reinforce that live chat titles should explain
  role, repo/product, and enduring mission before any backend continuity token
- doctor scripts now warn on both compact-ID drift and numbered buyer-facing
  title drift inside shipped naming guidance

## [v1.61] - 2026-05-03

### Added

- `orchestration/DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md` so live naming now
  has an explicit rule for separating human display names from stable lanes and
  compatibility routing ids
- fixture coverage for active-map rows that lose display-name versus routing-id
  separation

### Changed

- `orchestration/ACTIVE-CHAT-MAP.md` now teaches a display-name-first row shape
  instead of leading with compact or legacy routing ids
- active-map hygiene and head/manager control-plane guidance now explicitly
  require human-readable display names ahead of routing ids on the live roster
- doctor checks now warn when the active map no longer separates display names
  and routing ids clearly
- the live dashboard now surfaces human-readable owners first, with routing ids
  as compatibility metadata

## [v1.60] - 2026-05-03

### Added

- `orchestration/LINEAGE-AND-PROGRESSION-MODEL.md`,
  `orchestration/ROTATION-THRESHOLD-GATE.md`,
  `orchestration/LIVE-STATE-POPULATION-PROTOCOL.md`,
  `orchestration/WORKSTREAM-CELL-REGISTRY.md`,
  `orchestration/CHUNK-TRACKING-RULE.md`,
  `orchestration/HEAD-MANAGER-CONTROL-PLANE-LOOP.md`, and
  `orchestration/LEGACY-LIVE-ID-MIGRATION.md` so naming, progress, rotation,
  and live-state population now have a first-class model instead of being
  inferred from lane IDs
- fixture coverage for progression/control-plane regression, including missing
  lineage/progression docs and missing chunk fields in runtime workstream state

### Changed

- head and manager startup/prompt surfaces now explicitly read progression,
  rotation, and control-plane docs instead of relying on mixed legacy naming
  intuition
- the live system now uses real `ACTIVE-WORKSTREAMS.md`, `health/summary.json`,
  `health/workstreams.json`, and `health/DASHBOARD.md` truth instead of generic
  placeholders
- runtime health seeds are no longer forced to stay in sync with live runtime
  state, so package starter files can stay neutral while the live system stays
  current
- doctor checks now verify progression/control-plane doc presence plus chunk
  shape in active-workstream and health-workstream files

## [v1.59] - 2026-05-03

### Added

- `orchestration/REVIEW-TOPOLOGY-LADDER.md`,
  `orchestration/MANAGER-CONTEXT-PURITY-GATE.md`,
  `orchestration/REVIEW-CELL-MODEL.md`,
  `orchestration/SECOND-BRAIN-DIVERSITY-GATE.md`,
  `orchestration/ASSURANCE-TO-TOPOLOGY-MATRIX.md`, and
  `orchestration/PROVIDER-BINDING-RULE.md` so dual-brain quality now has an
  explicit topology model instead of relying on one overloaded reviewer
- public `manager` startup, prompt, and hot-path role surfaces in the package,
  plus review-topology commands for topology choice, context-purity checks,
  provider-mix checks, review-cell formation, and cell-health scoring
- review-topology and context-purity fields in orchestration health/state
  artifacts so live systems can track review load, diversity, and audit shape

### Changed

- head, manager, and super guidance now choose the lightest honest review
  topology for each workstream instead of assuming one manager should review
  every active super lane deeply
- active workstreams, health JSON, and dashboard surfaces now carry explicit
  review-cell ownership, topology, manager-load, and provider-diversity truth
- the package doctor, fixture checks, and release preflight now verify the new
  manager/review-topology surfaces and fail if dual-brain review architecture
  regresses

### Added

- `orchestration/AGENTS.md` and `orchestration/CLAUDE.md` as thin hot-path
  memory layers for Codex and Claude Code work inside the orchestration system
- reusable Claude project commands for inbox sync, lane sync, checkpoint
  refresh, internal handoff routing, and pickup-trigger drafting
- modular `.claude/rules/` files for hot-path, continuity, and collaboration
  discipline
- `templates/SPEC.md`, `templates/PLAN.md`, and `templates/STATUS.md` as a
  simpler default project memory stack
- `orchestration/DOCTOR-PLAYBOOK.md`,
  `orchestration/DOCTOR-FINDING-SCHEMA.md`, and
  `orchestration/DOCTOR-SEVERITY-MODEL.md` so doctor now has a first-class
  operating grammar
- doctor-native Claude commands for continuity audit, finding classification,
  finding promotion, propagation verification, and release audit
- `orchestration/STRATEGIC-FOUNDATION-GATE.md` so head and manager lanes now
  notice when direction is missing and help the buyer choose between vision
  work, roadmap work, brainstorming, or bounded execution

### Changed

- orchestration bootstrap now installs a root `CLAUDE.md` plus `.claude/rules/`
  alongside the existing agent and command surfaces
- the doctor now checks for the new Claude memory, command, and rules surfaces
- the packaged Claude role files are now shorter hot-path operating cards
  instead of mini-manuals
- `templates/AGENTS.md` and `templates/CLAUDE.md` now explicitly teach a thin
  hot path plus split-out work-memory docs
- the doctor role is now modeled more explicitly as a quality-and-recovery lane
  in startup and architecture docs
- doctor-specific fixture coverage now fails if core doctor assets or doctor
  grammar surfaces regress
- head and manager startup/prompt surfaces now treat missing or too-thin
  strategic direction as a first-class user-facing steering moment instead of
  silently acting as if roadmap certainty already exists
- tightened super momentum and pickup-trigger guidance so a completed super
  should no longer quietly park an active workstream with pure
  `No user action needed:` when a live manager or other owner still needs a
  tiny nudge for production to continue now

## [v1.50] - 2026-05-03

### Added

- `orchestration/COLLABORATIVE-STEERING-GATE.md` to formalize the middle path
  between silent internal routing and heavyweight buyer-decision ceremony
- prompt-smoke coverage for collaborative steering without turning the buyer
  into the courier

### Changed

- transport, real-user-decision, delivery-tail, interruption-threshold, and
  review-to-launch rules now support `Recommended next move:` as a first-class
  buyer-guided delivery mode
- head, super, doctor, brainstorm, agent, and worker prompt surfaces now
  explicitly support lightweight buyer-guided workflow steering followed by
  direct execution after `go`

## [v1.49] - 2026-05-03
### Added

- `orchestration/ACTIVE-PICKUP-TRIGGER-GATE.md` so the package now separates
  continuity from momentum
- fixture coverage for passive-inbox pickup drift so release trust now depends
  on the package remembering that routed truth is not the same as active pickup

### Changed

- tightened transport, wake, update-bus, interruption-threshold, review-to-
  launch, and active-owner rules so `No user action needed:` is no longer
  allowed when a passive live lane still needs a buyer nudge to resume now
- tightened shipped supervisor guidance so dual-brain flow can route internally
  and still surface one tiny buyer action when live momentum actually depends
  on it

## [v1.48] - 2026-05-03
### Added

- `orchestration/PLAIN-LANGUAGE-GATE.md` so the package now explicitly teaches
  buyers what internal orchestration terms mean on first use
- fixture coverage for the plain-language guidance so release trust now depends
  on the shipped orchestration install still translating core terms like
  `slice` and `lane`
- prompt smoke coverage for buyer synonym acceptance so plan/spec/work
  doc/thread/status note language is tested too

### Changed

- tightened the buyer front doors and orchestration onboarding docs so
  internal words like `slice`, `lane`, `checkpoint`, and `closeout` are
  explained in ordinary language instead of assumed
- tightened the shipped head/super/doctor prompt surfaces so the system should
  explain its own vocabulary before leaning on it
- tightened more shipped role surfaces so the package accepts buyer words like
  plan, spec, work doc, thread, and status note without making the buyer adopt
  insider jargon first
- corrected a remaining stale compact agent-name example in
  `orchestration/DOC-FIRST-ORCHESTRATION.md`

## [v1.47] - 2026-05-03
### Added

- `orchestration/USER-INTERRUPTION-THRESHOLD.md` so the package now states a
  hard rule for when the buyer should be interrupted at all
- fixture coverage for the new interruption-threshold guidance so release trust
  now depends on `Steps for you` staying conditional rather than reverting to a
  mandatory tail

### Changed

- corrected older prompt/reference wording that still taught "end every
  response with Steps for you" even when no buyer action was needed
- tightened the shipped head prompt and super-reference so visible action tails
  now depend on real buyer-owned work instead of formatting habit

## [v1.46] - 2026-05-03
### Added

- internal-routing regression checks in `_internal/run-fixture-checks.ps1` so
  release trust now depends on the shipped orchestration install still
  preferring runtime inbox routing over buyer-carried wakes when a live lane
  can route the handoff itself

### Changed

- tightened `UPDATE-BUS.md`, `WAKE-AND-CONTINUE-GATE.md`,
  `OPERATOR-ACTION-OWNERSHIP-GATE.md`, and `TRANSPORT-CHOICE-GATE.md` so live
  lane-to-lane handoffs prefer durable runtime routing plus
  `No user action needed:`
- tightened the shipped head and super prompts so a live owner should route
  through runtime inbox/update-bus files before asking the buyer to transport a
  wake

## [v1.45] - 2026-05-03
### Added

- a first-class `No user action needed:` delivery mode for internal
  transitions, awareness-only updates, and state reports that should not become
  buyer chores
- autonomy regression checks in `_internal/run-fixture-checks.ps1` so release
  trust now depends on the shipped orchestration install still containing:
  - the no-action delivery mode
  - the anti-approval-loop wording for "I'll do it on your signal"

### Changed

- tightened transport, delivery-tail, collaboration, owner-momentum, and
  operator-action ownership guidance so internal review/routing transitions no
  longer need decorative buyer-facing action blocks
- added an explicit default-proceed rule to the shipped head and super prompts
  so bounded and safe next moves should advance automatically unless a real
  strategy, release, budget, or durable-policy boundary is being crossed
- clarified that asking the buyer to approve writing the implementation slice
  itself is a workflow defect, not healthy caution

## [v1.44] - 2026-05-02
### Added

- `orchestration/COMPACTION-CADENCE-LOOP.md` as the package's canonical rhythm
  for compact / rotate / checkpoint / closeout timing
- `orchestration/CHECKPOINT-EVENT-THRESHOLDS.md` so long-running lanes now have
  an explicit rule for what belongs in append-only event history
- `orchestration/CONTEXT-TAX-HEURISTIC.md` so lanes can intervene earlier when
  clarity and efficiency are degrading before obvious context collapse

### Changed

- aligned the checkpoint template with the closeout gate by adding explicit
  continuity fields such as `Last verified at`, `Freshness window`,
  `Terminal status`, `Pickup confidence`, and `Resume risk`
- tightened both doctor scripts so orchestration installs now warn on stale
  checkpoint continuity fields and closeout packets missing lane-state cleanup
- expanded fixture checks so release trust now also proves:
  - stale checkpoint continuity warnings fire
  - closeout lane-state cleanup warnings fire
- updated install config naming memory and continuity references so bootstrap,
  compaction docs, resume docs, and package shortcuts all agree on the current
  operating model

## [v1.43] - 2026-05-02
### Added

- `orchestration/NAMING-SCHEMA.md` as the canonical package rule for visible
  titles, stable lane keys, progress metadata, and continuation tokens
- install-time naming drift checks in both doctor scripts so stale compact
  launch examples can be caught after bootstrap instead of lingering silently

### Changed

- rewrote the shipped naming examples away from overloaded compact IDs like
  `s7-auth`, `a2-cache`, `h1r2`, `r2`, and `.1`, and toward full-word lane
  keys plus `--runN` / `--recoverN`
- refreshed the healthy orchestration smoke fixture and extended fixture checks
  so release trust now depends on the new naming model surviving bootstrap
- added migration guidance for switching live orchestration usage to the new
  naming model without renaming active lanes midstream

## [v1.42] - 2026-05-02
### Added

- `QUICK-PATHS.md` so buyers now have persona-based fast starts instead of
  only a generic selector
- `FIRST-30-MINUTES.md` so the package now tells first-time users exactly how
  to get from bootstrap to one real task without reading the whole pack first

### Changed

- tightened the front doors so `README.md`, `START-HERE.md`, and
  `CHOOSE-YOUR-SETUP.md` now route buyers through a smaller decision path
- expanded `PLATFORM-SETUP.md` with clearer first-run guidance for Codex app,
  Codex terminal, and IDE-first execution surfaces
- strengthened `QUICK-REFERENCE.md` so Codex and IDE-first users get more
  operationally concrete defaults instead of broad caveats
- added a second negative fixture scenario so the release gate now proves the
  doctor fails when the runtime update feed is missing
- clarified the public tier posture: flagship / Pro now, smaller tiers only
  after real buyer usage proves clean carve lines

## [v1.41] - 2026-05-02
### Added

- release-grade smoke-fixture tooling under `_internal/` so package health can
  now be proven against refreshed lightweight and orchestration installs
- archived-versus-current fixture labeling plus first negative doctor coverage
  for placeholder active-map drift

### Changed

- refreshed the orchestration smoke install so it now matches current bootstrap
  and doctor expectations instead of silently drifting behind package truth
- wired release preflight to run fixture validation before trusting a new zip
- tightened both doctor scripts so they now also verify the shipped `worker`
  role path and check a few higher-value runtime helper files
- brought the shell bootstrap install-config and enabled-modules starters
  closer to PowerShell parity for naming, model-control, and tool-mode truth

## [v1.40] - 2026-05-02
### Added

- `orchestration/HUMAN-FRIENDLY-NAMING-GATE.md` so buyer-facing chat titles
  now prefer full words like `Head1`, `Doctor1`, `Supervisor1`, `Agent1`, and
  `Brainstorm1` instead of expecting first-time users to decode shorthand
- `orchestration/START-DOCTOR.md`, `orchestration/doctor-prompt.md`, and
  `orchestration/.claude/agents/doctor.md` so the package now ships a real
  public doctor role for audit, diagnosis, recovery, and quality review

### Changed

- tightened the front doors, orchestration README, head startup, and launcher
  docs so role discovery is explicit and the buyer sees the full role menu
  earlier
- clarified that compact lineage shorthand may still exist in legacy/runtime
  artifacts, but it should not be the first thing a new buyer sees in desktop
  or app chat titles
- updated the doctor scripts so orchestration installs now expect a doctor
  agent definition alongside head, super, and agent

## [v1.39] - 2026-05-02
### Added

- `orchestration/ACTIVE-MAP-FRESHNESS-GATE.md` so the package now treats stale
  active-map truth and missing live-lane registration as first-class routing
  failures

### Changed

- tightened startup, session-ID, transport, and active-map hygiene guidance so
  new live continuations must claim the lane before session-specific routing is
  trusted
- clarified that `ACTIVE-CHAT-MAP.md` is a live registry, not a history dump,
  and that closed child rows do not belong in active sections
- hardened both doctor scripts to warn when the active map still has a
  placeholder `Last verified` line or closed rows inside `Active Child Chats`

## [v1.38] - 2026-05-02
### Added

- `orchestration/REAL-USER-DECISION-GATE.md` so the package now distinguishes
  true buyer-owned decisions from bounded reviewer-owned technical fixes

### Changed

- tightened collaboration, transport, owner-momentum, and super-startup logic
  so lanes should stop bouncing small technical threshold calls to the user
  when they already have a clear recommended fix
- clarified that `Decision needed from buyer:` is not the right ending for
  review-owned tightening that can already be converted into an exact update,
  wake, or handoff artifact

## [v1.37] - 2026-05-02
### Added

- `orchestration/CAPABILITY-AWARENESS-GATE.md` so live lanes now have a shared
  rule for surfacing active subscriptions and optional paid surfaces when they
  materially improve the path
- `templates/OPERATOR-CAPABILITIES.md` so buyers have a durable place to
  record things like Replit Core or future remote-session hosts

### Changed

- tightened startup synthesis, update-bus guidance, and role prompts so new
  capabilities are no longer supposed to stay "available but invisible"
- clarified that capability changes should update local capability memory and,
  when relevant to live lanes, publish through the update bus

## [v1.36] - 2026-05-02
### Added

- `REMOTE-SESSION-BRIDGE.md` plus `templates/REMOTE-SESSION-HANDOFF.md` so
  future long-running remote Claude Code or Codex sessions in Replit can adopt
  the package without inventing a second orchestration system

### Changed

- deepened the Replit module so it now explains how Replit results should flow
  back into checkpoints, closeouts, and the update bus instead of being left in
  cloud chat history
- tightened the front doors and quick references so buyers can distinguish:
  - bounded Replit sandbox use
  - demo/publish/auth/DB acceleration
  - future remote-session hosting for long-lived cloud AI lanes

## [v1.35] - 2026-05-02
### Added

- `REPLIT-INTEGRATION.md` as an optional-cloud guidance doc for using Replit
  as a bounded sandbox, demo, publish, auth, or database helper
- `REPLIT-COST-GATE.md` so buyers treat Replit as a scoped credit surface
  instead of vague extra compute
- `START-REPLIT-SANDBOX.md` plus `templates/REPLIT-HANDOFF-TEMPLATE.md` for
  bounded Replit startup and return-truth discipline

### Changed

- tightened the front doors and quick reference so Replit is presented as an
  optional accelerator that keeps local package docs as canonical truth
- clarified that Replit should speed up setup, demo, auth, or DB work without
  replacing the package's local orchestration and checkpoint system

## [v1.34] - 2026-05-02
### Added

- `orchestration/OPERATOR-ACTION-OWNERSHIP-GATE.md` so the package now
  separates execution reports, canonical doc truth, and the final
  buyer-facing operator action

### Changed

- tightened doc-first, transport, routing, and slice-template guidance so
  terminal lanes prefer state updates, execution reports, and wakes while the
  highest active coordination lane usually owns the final buyer-facing copy
  block
- clarified that buyer-facing copy blocks should only appear when real human
  action is needed, not as decorative restatements of already-current doc
  truth

## [v1.33] - 2026-05-02
### Added

- `orchestration/WAKE-AND-CONTINUE-GATE.md` so existing live lanes can be
  resumed from canonical doc truth with a tiny wake artifact instead of another
  large pasted packet
- `orchestration/REVIEW-TO-LAUNCH-GATE.md` so the package now treats the
  review-to-launch boundary as a single-owner transition instead of letting
  several lanes half-own the final execution handoff

### Changed

- tightened doc-first, transport, spawn, launch-readiness, execution-routing,
  update-bus, slice-template, and super-startup guidance so approved slices
  wake the real launch owner instead of forcing the user to relay review-layer
  launch packets
- clarified that supervised execution should normally use:
  - review lane updates approval truth
  - super owns the final child-agent launch or blocker
- clarified that `status: approved` plus `launch_ready: yes` is the normal
  launch boundary vocabulary, instead of inventing pseudo-states like
  `execution_ready`

## [v1.32] - 2026-05-02
### Added

- `FIRST-WEEK-PLAYBOOK.md` as a buyer-facing first-week and long-term usage
  guide for noob operators, experienced developers, and model/tool lanes

### Changed

- tightened the front doors, quick references, bootstrap docs, and setup path
  so the new playbook is part of the normal onboarding flow instead of hidden
  deeper in the pack
- brought the shell bootstrap and shell doctor closer to PowerShell parity by
  creating and validating the newer runtime structures:
  `checkpoint-events/`, `closeouts/`, and `updates/`
- improved bootstrap end messages so buyers get clearer next reads and a more
  obvious "run the doctor next" path on both lightweight and orchestration
  installs

## [v1.31] - 2026-05-02
### Added

- canonical closeout packet templates under `orchestration/closeouts/` so
  meaningful lanes can end with one durable closure artifact instead of
  scattered final truth
- checkpoint-event templates under `orchestration/checkpoint-events/` so
  long-running or high-assurance lanes can keep append-only gate history
  alongside the latest overwritten checkpoint

### Changed

- extended checkpoint templates with freshness, pickup-confidence, resume-risk,
  terminal-status, and closeout-intent fields
- tightened closeout, active-workstream, runtime-separation, bootstrap, and
  doctor flows so buyers get stronger closeout hygiene without losing fast
  solo operation on lighter lanes
- clarified the shape of closeout truth:
  slice = planning/review truth, checkpoint = latest execution truth,
  checkpoint-events = gate history, closeout packet = final closure truth

## [v1.30] - 2026-05-02
### Added

- `orchestration/STAGED-EDIT-PROTOCOL.md` so risky package/doc surgery now has
  an explicit default of small verified edit chunks instead of one brittle bulk
  pass

### Changed

- tightened doc-update, self-improvement, and coordination-prompt guidance so
  broader shared-file edits use staged verification by risk boundary
- clarified that the reason for smaller verified pieces is shared-surface risk
  and cleaner failure boundaries, not a blanket belief that all edits must be
  tiny

## [v1.29] - 2026-05-02
### Added

- `orchestration/MULTITASKING-THROUGHPUT-GATE.md` so the package now treats
  safe throughput, parent-slice decomposition, and super-owned fanout as
  first-class routing concerns

### Changed

- extended slice templates so one canonical slice can now explicitly model
  `standalone`, `parent`, and `child` shapes plus fanout/dependency state
- tightened head, super, review, spawn, routing, and startup guidance so the
  system actively looks for safe parallel child slices instead of serializing
  larger workstreams by habit
- clarified that one super may own multiple child execution lanes when the
  collision map is explicit, while multiple supers remain the answer for truly
  independent workstreams

## [v1.28] - 2026-05-02
### Added

- `orchestration/UPDATE-BUS.md` plus starter runtime update files so the
  package now supports publish-once, consume-locally workflow updates
- bootstrap-created `_agent-system-runtime/updates/` structure with feed,
  index, watermarks, and inbox starter files

### Changed

- tightened startup synthesis, self-improvement, active-map targeting, and
  prompt guidance so live lanes check durable update truth at fixed moments
  instead of relying on repeated manual note-pasting
- updated bootstrap and doctor flows so orchestration installs now create and
  validate the runtime update bus by default

## [v1.27] - 2026-05-02
### Added

- `orchestration/DELIVERY-TAIL-PRESENTATION.md` so the package explicitly
  teaches end-weighted copy/launch tails, clear copy labels, and command-last
  ordering

### Changed

- tightened transport and prompt guidance so the real copy block and final
  command belong at the end of the response instead of appearing earlier and
  forcing the user to scroll back up
- clarified that a technically correct transport mode still fails UX if the
  action tail is visually weak, buried, or ordered backward

## [v1.26] - 2026-05-01
### Added

- `orchestration/EXECUTION-ROUTING-GATE.md` so the package distinguishes head
  approval, supervisory slice ownership, agent execution, and the small-task
  direct-agent exception

### Changed

- clarified buyer-facing collaboration and spawn guidance so execution-shaped
  slices are normally pressure-tested by review brain plus super, not head plus
  review brain
- tightened the shipped startup and prompt spine so supers supervise, agents do
  the work, and direct agent launches stay the bounded exception instead of
  becoming the silent default

## [v1.25] - 2026-05-01
### Added

- `orchestration/ARTIFACT-CUSTODY-GATE.md` so buyer-facing orchestration can
  distinguish strategic approval, operational ownership, and mutation custody
  for canonical slices and launch tails

### Changed

- tightened doc-update and lane-ownership guidance so direct-edit permission
  for runtime docs no longer silently overrides the live owner's custody of the
  canonical work artifact
- clarified head/super buyer guidance so higher layers route approval back to
  the current coordination owner unless ownership and custody are explicitly
  reclaimed
- made the doc-first workflow more explicit that approval and artifact mutation
  are separate responsibilities

## [v1.24] - 2026-05-01
### Added

- `templates/OPERATOR-PREFERENCES.md` so buyers have one durable place to store
  role baselines, preferred surfaces, and premium-escalation policy
- `orchestration/OPERATOR-PREFERENCE-MEMORY.md` so buyer-stated model and
  launch preferences are promoted into durable truth instead of being forgotten
  in chat history

### Changed

- tightened launch/model guidance so role launches now read preference memory,
  then model config, then runtime truth instead of treating prompt defaults as
  the only source of authority
- updated bootstrap scripts and doctor checks so fresh installs now include and
  validate operator preference memory
- clarified buyer-facing startup and orchestration docs so durable role/model
  choices are expected to live in local preference memory before heavy multi-chat work

## [v1.23] - 2026-05-01
### Added

- `CHOOSE-YOUR-SETUP.md` as the new selector-first buyer front door for
  workflow weight, main surface, cost posture, and review posture
- `bootstrap/README.md` plus bootstrap installers and doctor scripts so buyers
  can create a healthy layout without manually copying every layer by hand

### Changed

- rewrote the main front doors around a cleaner product path:
  choose setup, bootstrap, run doctor, then read only the next required docs
- made doc-first orchestration more central to the buyer flow once work becomes
  multi-chat, reviewed, or repeatedly relaunched
- cleaned buyer-facing public wording so orchestration does not imply a hidden
  public manager layer
- tightened the doctor so it warns about unexpected public manager artifacts in
  buyer installs

## [v1.22] - 2026-05-01
### Added

- `orchestration/ACTIVE-OWNER-MOMENTUM.md` so live owners do not hand obvious
  next review or routing steps back to the user as soft homework
- `orchestration/LANE.md` so strategic approval does not get
  confused with operational launch or closeout authority

### Changed

- tightened head/super orchestration guidance so `Continue here with:` is no
  longer acceptable when the current lane still owes the main reasoning step
- clarified the doc-first and transport rules so direct slice edits should be
  followed by owner-side judgment, exact external handoff, or explicit stop
  state instead of user babysitting
- clarified that a higher layer approving direction does not automatically
  reclaim a lower owner's workstream or child-lane routing duties

## [v1.19] - 2026-05-01

### Added

- `orchestration/DOC-UPDATE-PROTOCOL.md` so the package distinguishes direct
  runtime-artifact edits, human-friendly replacement/append blocks, and true
  patch-tool flows

### Changed

- tightened head/super and doc-first guidance so tiny slice/review/runtime-doc
  edits are handled by the nearest tool-capable coordination lane instead of
  creating worker theater
- clarified that `Update this doc:` should usually use replacement/append
  blocks for human-facing app lanes, not raw `@@` patch hunks
- strengthened delivery-tail guidance so non-launch responses omit empty Claude
  prompt blocks entirely

## [v1.18] - 2026-05-01

### Changed

- tightened `Update this doc:` so non-editing lanes must provide one exact
  replacement block, append block, or patch block instead of a blurry edit
  wishlist
- strengthened head/super/manager delivery-tail rules so naming a file without
  an executable doc update no longer counts as a complete handoff

## [v1.17] - 2026-05-01

### Added

- `orchestration/TRANSPORT-CHOICE-GATE.md` so routed chats end with one exact
  next-action artifact instead of vague prose that forces the user to act like
  a manual transport layer

### Changed

- tightened public head, super, agent, brainstorm, collaboration, identity,
  task-packet, handoff, slice, and review docs so copy blocks, doc updates,
  launches, and same-chat continuations are explicit and consistent
- clarified that canonical slice docs reduce packet drift, but responses still
  need a concrete delivery tail: continue here, update doc, paste into named
  chat, launch, decide, or stop
- strengthened supervisory guidance so collaboration now pressure-tests the
  delivery artifact too, not just the analysis

## [v1.16] - 2026-05-01

### Added

- `orchestration/DOC-FIRST-ORCHESTRATION.md` as a buyer-facing guide for
  canonical slice docs, tiny launch stubs, and chat commentary versus doc
  truth
- `orchestration/SLICE-STATE-RULES.md` plus live slice and review templates so
  buyers can move from giant pasted packets to canonical work docs
- example Claude project slash commands for creating, reviewing, launching, and
  closing slices inside `.claude/commands/`

### Changed

- tightened orchestration startup, runtime, migration, handoff, and review docs
  so task packets are now the transport fallback rather than the only work
  object
- moved buyer-facing startup launch commands to the end of the START files to
  match the package's own UX rule
- removed stale terminal-only wording and cleaned up runtime-shape drift in the
  buyer-facing prompts and references

## [v1.15] - 2026-05-01

### Added

- `orchestration/SYSTEM-IMPROVEMENT-LOOP.md` as a buyer-safe guide for keeping
  local quirks, local lessons, runtime issues, and candidate package
  improvements in the right layer
- `templates/LOCAL-QUIRKS.md` so buyers can keep environment-specific quirks
  and limitations outside replaceable vendor files

### Changed

- strengthened upgrade, migration, customization, and template guidance so
  buyer-specific self-improvement survives package upgrades instead of getting
  overwritten with the vendor layer
- clarified the promotion ladder from one-off incident to local quirk to
  repeated local pattern to shared package truth

## [v1.14] - 2026-05-01

### Added

- `SURFACE-COMPACTION-AND-RESUME.md` as a buyer-facing guide for teaching
  different compact / rotate / resume behavior across Claude Code terminal,
  Codex terminal, Codex app, and Claude desktop/app lanes

### Changed

- strengthened platform, quick-reference, translation, orchestration, and cost
  docs so surface-specific continuity behavior is treated as a first-class
  quality and budget concern instead of one generic compaction rule
- clarified that terminal surfaces with documented compact/resume controls can
  be made more automatic, while app surfaces often want cleaner thread
  rotation and migration packets
- changed startup-prompt examples and prompt rules so manual terminal launch
  commands now belong at the end of the response, after the full startup body,
  which makes copy/paste smoother for buyers

## [v1.13] - 2026-05-01

### Changed

- expanded Claude Code guidance around officially documented power features so
  buyers discover `/statusline`, custom slash commands, `/doctor`,
  `/permissions`, `/terminal-setup`, and other underused native workflow tools
- added role-colored Claude Code statusline examples so named head, super,
  manager, agent, worker, and brainstorm lanes are easier to distinguish in
  parallel terminal use
- clarified the buyer-safe truth that named sessions plus statusline colors are
  the current documented way to get visual lane identity, rather than relying
  on undocumented `/color` or `/rename` assumptions

## [v1.12] - 2026-05-01

### Added

- `orchestration/IDENTITY-DISCIPLINE.md` so reports, checkpoints, handoffs, and
  paste-ready instructions carry explicit source and target identity

### Changed

- tightened wrong-chat recovery and output rules so the system names who
  produced an artifact, who it is for, and whether the user should paste it to
  another lane or continue in the current one
- added provenance fields to public checkpoints, handoffs, and execution
  reports so rotation, recovery, and collaboration do not lose source identity

## [v1.11] - 2026-04-30

### Added

- `orchestration/WRONG-CHAT-RECOVERY.md` as a hard-stop and salvage guide for
  wrong-paste, wrong-role, wrong-session, and wrong-workstream mistakes

### Changed

- tightened startup and task-packet guidance so meaningful lanes now carry an
  explicit intended recipient session and a hard-stop rule if the packet lands
  in the wrong chat
- strengthened contamination recovery so the system can stop, salvage, reroute,
  and clean up lane state instead of accidentally continuing real work in the
  wrong lane

## [v1.10] - 2026-04-30

### Added

- `orchestration/ACTIVE-LANE-CLOSEOUT.md` so meaningful lanes explicitly mark
  themselves active, paused, rotating, or closed as part of closeout

### Changed

- tightened closeout and reflection rules so reviewed work is not considered
  operationally closed until lane-state cleanup is explicit
- strengthened active-map hygiene so pause, rotation, and completion no longer
  rely on user memory or vague follow-up intent

## [v1.09] - 2026-04-30

### Added

- `orchestration/COLLABORATION-LOOP.md` as a buyer-facing guide for turning
  dual-brain review into a real challenge-response loop instead of command and
  compliance

### Changed

- tightened audited-lane guidance so higher-assurance work now requires
  explicit collaboration status alongside checked / not checked / still depends
  on
- strengthened the supervisory startup and orchestration docs so buyers are
  pushed toward independent judgment between review layers instead of one review
  brain treating the other like a worker

## [v1.08] - 2026-04-30

### Added

- `orchestration/ACTIVE-MAP-HYGIENE.md` as a simple guide for keeping the live
  active-chat map small, current, and easy to update

### Changed

- hardened `ACTIVE-CHAT-MAP.md` with a visible `Last verified` field, quick row
  templates, and clearer update-targeting behavior
- updated startup files and startup-synthesis guidance so meaningful chats
  confirm or add themselves to the active map before real work
- added stale-map fallback guidance so the system degrades cautiously instead
  of confidently guessing which chats are active

## [v1.07] - 2026-04-30

### Changed

- hardened active-chat update targeting so the self-improvement loop now tells
  buyers to read `ACTIVE-CHAT-MAP.md` before deciding which still-running chats
  should receive new workflow or rule updates
- tightened orchestration front doors and quick-start guidance so Claude Code
  users discover telemetry-aware compaction earlier instead of relying on
  session feel

### Fixed

- removed stale internal wording from the shared system docs that still implied
  the main agent was only a Claude-handler instead of the direct execution
  owner

## [v1.06] - 2026-04-30

### Added

- `CLAUDE-CODE-SESSION-TELEMETRY.md` as a buyer-facing guide for Claude
  Code statusline telemetry, live runtime truth, and compaction-aware setup
- example Claude Code statusline scripts for Bash and PowerShell in
  `templates/`

### Changed

- tightened Claude-native guidance so `/compact` is treated as something that
  should be driven by visible telemetry and workflow triggers, not by guesswork
- added explicit setup guidance for `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` so long sessions compact earlier when that
  is the safer default
- updated the public startup, compaction, hooks, and quick-reference docs so
  buyers can make Claude Code behave more like a reliable operator and less
  like a brilliant tool with no body awareness

## [v1.05] - 2026-04-30

### Added

- `CLAUDE-CODE-POWER-FEATURES.md` as a buyer-facing guide for Claude Code's
  native power features instead of relying on prompt folklore alone
- `orchestration/STARTUP-SYNTHESIS-GATE.md` so meaningful sessions actually
  synthesize role, ownership, runtime shape, and next action before acting
- `orchestration/ROLE-AWARE-COMPACTION.md` so `/compact` is treated as a
  clarity tool, not only a last-second memory tool
- `orchestration/TODO-POLICY.md` so buyers know when built-in todos should and
  should not be used
- `orchestration/CLAUDE-HOOKS-INTEGRATION.md` so hooks are introduced as
  opt-in deterministic guardrails instead of an afterthought

### Changed

- updated the public front doors and Claude-native setup docs so serious Claude
  Code users discover the native workflow path earlier
- expanded Claude Code quick-reference guidance to cover `/agents`, `/memory`,
  `/review`, `/pr_comments`, `/add-dir`, and output styles
- wired the orchestration startup files and prompts to the new synthesis,
  compaction, todo, and hooks guidance

## [v1.04] - 2026-04-30

### Changed

- added explicit assurance levels `A0` to `A3` so the system can tell when work
  needs self-check only, supervisor review, independent closeout review, or
  both preflight and closeout review
- added a closeout gate so "done" and "safe to close" are no longer treated as
  the same thing
- added explicit execution owner, review owner, approval owner, and coverage
  statement expectations for meaningful work so collaboration does not collapse
  into vague shared confidence

## [v1.03] - 2026-04-30

### Changed

- added a pre-launch packet audit gate so high-risk or caution-worthy manual
  agent packets can be reviewed before the user launches the worker
- clarified that dual-brain mode can help before execution, not only at
  closeout
- strengthened supervisor routing so cross-repo, infra-dependent, auth, or
  ambiguous verification packets do not default straight to launch

## [v1.02] - 2026-04-29

### Changed

- added a buyer-facing recovery rule: salvage before restart
- clarified that wrong repo state, wrong branch, or broken workspace state
  should first be classified into invalid state, recoverable work, and
  unrecoverable work
- added public guidance for choosing between transfer recovered work,
  partially replay work, and full restart

## [v1.01] - 2026-04-29

### Changed

- established `v1.01` as the first normalized public package baseline
- carried forward the current hardened package state from the pre-baseline
  `v3.7` internal cut
- tightened capability-first runtime-shape guidance so desktop/app lanes,
  terminal lanes, IDE agent lanes, and web/manual lanes are routed by verified
  capabilities instead of brand analogy

## [v3.7] - 2026-04-29

### Changed

- tightened the package around runtime-shape truth so desktop/app lanes,
  terminal lanes, IDE agent lanes, and web/manual lanes are treated as
  distinct workflow shapes
- reduced product-label drift by telling buyers to route from verified
  capabilities first instead of assuming every strong model fits the same
  launch pattern
- clarified that Claude desktop-style repo-aware lanes, Codex app lanes, and
  similar setups should be preserved according to actual capabilities rather
  than downgraded to generic web chat or forced into terminal assumptions

## [v3.6] - 2026-04-29

### Changed

- hardened active lane continuity so head/super/brainstorm flows can
  preserve live app/runtime setup, not just lineage
- reduced the chance that GPT Desktop or Codex app lanes get
  reinterpreted as generic terminal lanes during continuation or
  relaunch recommendations

## [v3.5] - 2026-04-29

### Changed

- hardened brainstorm continuity so existing live brainstorm lineage and
  runtime/setup are preserved by default
- reduced the chance that a buyer gets a generic terminal brainstorm
  recommendation when their real setup is already a live desktop/app
  brainstorm lane

## [v3.4] - 2026-04-29

### Added

- `CHANGELOG.md` for buyer-visible package history
- `MIGRATIONS.md` for upgrade and selective-adoption guidance
- `templates/ENABLED-MODULES.md` so buyers can declare which package
  modules they actually want active
- `templates/LOCAL-LESSONS.md` for buyer-specific friction and local
  operating truth
- `templates/LOCAL-WINS.md` for buyer-specific patterns worth reusing

### Changed

- clarified that buyer self-improvement should live in local/runtime
  layers, not be mixed into replaceable vendor files
- upgraded the upgrade docs so buyers can adopt all, some, or none of a
  new package's workflow changes intentionally
- made the front door clearer about changelog, migrations, and selective
  adoption

## [v3.3] - 2026-04-29

### Added

- active chat map for live lineage truth
- context-load gate for earlier compaction and rotation decisions
- spawn-decision gate so new chats are justified by routing need
- self-improvement loop that turns friction into durable changes and
  active-chat updates

### Changed

- strengthened the public orchestration system around action-boundary
  gates instead of passive memory alone

## [v3.2] - 2026-04-29

### Added

- session-ID gate so new chat IDs come from verified live lineage
  instead of first-unused numbering or stale historical residue

### Changed

- clarified lineage-preserving naming across head, super, and agent
  flows

## [v3.1] - 2026-04-28

### Added

- upgrade-safe vendor/local/runtime separation guidance
- install-config pattern for buyer-specific storage truth

## [v3.0] - 2026-04-28

### Added

- phase-aware naming and long-term storage system

## [v2.9] - 2026-04-28

### Added

- verified capability matrix
- adaptive routing matrix

### Changed

- clarified direct standalone agent versus super-owned agent naming

## [v2.8] - 2026-04-28

### Added

- true dual-brain audited mode

## [v2.7] - 2026-04-28

### Changed

- clarified manual terminal agent chats versus directly spawned helper
  subagents

## [v2.6] - 2026-04-28

### Added

- state-aware chat-state routing
- runtime-model truth gate
- quality-routing hardening

## [v2.5] - 2026-04-28

### Changed

- restored missing buyer-safe value from earlier package versions while
  keeping the corrected public no-manager architecture
## [v1.50] - 2026-05-03

### Added

- `orchestration/COLLABORATIVE-STEERING-GATE.md` to formalize the middle path
  between silent internal routing and heavyweight buyer-decision ceremony
- prompt-smoke coverage for collaborative steering without turning the buyer
  into the courier

### Changed

- transport, real-user-decision, delivery-tail, interruption-threshold, and
  review-to-launch rules now support `Recommended next move:` as a first-class
  buyer-guided delivery mode
- head, super, doctor, brainstorm, agent, and worker prompt surfaces now
  explicitly support lightweight buyer-guided workflow steering followed by
  direct execution after `go`
# v1.78

- coordination-cost and packet-minimization hardening: same-workstream follow-on
  work must now explicitly price fresh-lane startup tax and keep handoff packets
  delta-only against canonical truth, reducing unnecessary supervisor spawns and
  summary churn

# v1.77

- easiest-step-first fix: when `Steps for you:` is genuinely needed and another
  live lane is the real next owner, the first step must now be the easiest
  recommended executable bridge; optional review, commit, or closeout chores
  come after the main bridge

# v1.76

- doctor target-resolution fix: doctor notes and repair prompts must now
  resolve the exact live lane target from `ACTIVE-CHAT-MAP.md` before naming
  a lane, and must phrase future naming rotation as a recommendation instead
  of assuming the lane already rotated
# v1.88

- added `WRONG-LANE-INPUT-GATE.md` so pasted notes that belong to another lane
  trigger a pause instead of blind scope drift
- added `MINIMAL-REPAIR-NOTE-RULE.md` so doctor prefers the shortest safe note,
  especially inbox-first recovery
- hardened doctor note protocol, mission lock, AGENTS hot path, and prompt
  smoke coverage around wrong-lane inputs and noob-friendly recovery notes
# v1.89

- added `LAUNCH-INTENT-DISAMBIGUATION.md` so desktop lanes stop collapsing
  `launch` into one guessed workflow
- added `TERMINAL-INJECTION-GATE.md` so direct terminal typing is no longer
  assumed when a safer launch packet is the better default
- hardened profiles, prompts, role cards, and smoke tests around
  packet-vs-spawn-vs-injection awareness
