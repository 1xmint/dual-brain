# Checkpoint Template

Copy this file to `checkpoints/<workstream-slug>.md` and fill it in.
Overwrite the same file on each gate — it always reflects current state.

---

# Checkpoint: <workstream name>
Date: <YYYY-MM-DD HH:MM UTC>
Gate passed: <what just completed>
Evidence: <PR URL, commit hash, or file path>
Next task: <exact next step>
Open decisions: <anything unresolved a new chat needs to know, or "none">
Blockers: <anything blocking next step, or "none">
Pickup prompt: <one sentence — what to tell Claude to continue from here>
Role check: <re-state your role in one sentence — forces active recall>
Layer check: <what this chat does / what it does NOT do>
Friction: <any problems encountered during this workstream: context rot,
  wrong-chat pastes, rule gaps, model misbehavior, etc., or "none". This is
  a running list — add to it every time friction is noticed, not just at
  archive. Organize as a numbered list of patterns when multiple exist.>
Task packet gaps: <what the original task packet failed to include that
  the supervisor had to discover, or "none". Examples: missing dependency
  listing, import path not specified, storage model not documented, API
  signature assumed not verified. These feed back to improve future
  task packets.>
Cross-workstream patterns: <generalizable lessons other supervisors/work
  chats would benefit from, or "none". Candidates for rule updates,
  task-packet-template improvements, or shared pattern library entries.>
