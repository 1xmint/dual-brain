# Checkpoint Template

Copy this file to `checkpoints/<workstream-slug>.md` and fill it in.
Overwrite the same file on each gate - it always reflects current state.

---

# Checkpoint: <workstream name>
Lane ID: <stable lane id, for example super-1-checkout-rollout or agent-12-checkout-api>
Session ID: <current chat id, for example agent-12-checkout-api--run2>
Checkpoint written by session: <session id>
Owner lane: <super-1-checkout-rollout / user / none>
Phase: <p1 / p2 / day0 / w3 / launch1>
Milestone: <m1 / m2 / none>
Chunk: <c01 / c02 / none>
Stable checkpoint slug: <stable-workstream-slug>
Related slice doc: <_agent-system-runtime/slices/file.md or none>
Date: <YYYY-MM-DD HH:MM UTC>
Last verified at: <YYYY-MM-DD HH:MM UTC>
Freshness window: <for example 4h / 1d / until next deploy / unknown>
Gate passed: <what just completed>
Evidence: <PR URL, commit hash, or file path>
Terminal status: <active / paused / rotating / blocked / closed / unknown>
Next task: <exact next step>
Open decisions: <anything unresolved a new chat needs to know, or "none">
Blockers: <anything blocking next step, or "none">
Pickup confidence: <high / medium / low>
Resume risk: <low / medium / high>
Archive path on close: <where final closeout should live, or "none yet">
Pickup prompt: <one sentence - what to tell Claude to continue from here>
Role check: <re-state your role in one sentence - forces active recall>
Layer check: <what this chat does / what it does NOT do>
Lane state if stopping now: <keep active / mark paused / mark rotating / mark closed>
Friction: <any problems encountered during this workstream: context rot,
  wrong-chat pastes, rule gaps, model misbehavior, etc., or "none". This is
  a running list - add to it every time friction is noticed, not just at
  archive. Organize as a numbered list of patterns when multiple exist.>
Wins: <patterns that worked notably well and should likely be repeated, or
  "none". Keep this short and only record things future chats should reuse.>
Task packet gaps: <what the original task packet failed to include that
  the supervisor had to discover, or "none". Examples: missing dependency
  listing, import path not specified, storage model not documented, API
  signature assumed not verified. These feed back to improve future
  task packets.>
Cross-workstream patterns: <generalizable lessons other supervisors/work
  chats would benefit from, or "none". Candidates for rule updates,
  task-packet-template improvements, or shared pattern library entries.>
Closeout packet needed: <yes / no / probably later>
Checkpoint event log: <path or "none">
