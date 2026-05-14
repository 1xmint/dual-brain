# Execution Completion To Closeout Protocol

Use this whenever an execution lane reports a build, fix, or trial as
complete.

If the execution lane is terminal and the buyer may see the report directly,
also use `TERMINAL-REPORT-CONVERSION-RULE.md`.

## Core Truth

Execution complete is not workstream complete.

A strong build report can still leave the control plane confused if the lane
does not also resolve:

- closeout state
- next owner
- pickup requirement
- buyer action mode

## Required Transition

After a meaningful execution completion, the owning coordination lane should
update or state:

1. `Execution outcome:`
2. `Closeout outcome:`
3. `What was checked:`
4. `What was not checked:`
5. `Still depends on:`
6. `Next owner:`
7. `Bridge mode:`
8. `Buyer action mode:`

If the completion is visible to the buyer before the coordination lane speaks,
the terminal lane must also resolve:

9. `Visible recipient:`
10. `Intended recipient:`
11. `What I already routed or updated:`

## Allowed Ending Modes

- `For you: you can just say done to the active <role/scope> chat.` or
  `For you: you can just say read your inbox to the active <role/scope> chat.`
  when a live parent pickup trigger is enough and
  no manual relay is needed
- `No user action needed:` only when closeout truth is already routed and
  waiting is genuinely acceptable
- `Recommended next move:` when the buyer should lightly steer the next control
  move
- exact bridge packet when another live lane should actively pick up now

Do not say `No user action needed:` and then list operator tasks in the same
turn.
Do not say `done` or `read your inbox` is enough unless parent-facing runtime
mail or inbox truth was actually written, or runtime mail was explicitly
unavailable and a different fallback bridge is provided.

## Strong Close

A strong close says:

- what shipped
- what quality bar was actually checked
- who owns commit/release/follow-up judgment now
- whether the workstream is waiting, paused, continuing, or closed

## Weak Close

- polished build summary with no next-owner resolution
- "both repos are green" without closeout state
- "the operator can now..." after claiming no action is needed
- parking the lane because "my part is done"
- agent completion report shown to the buyer even though manager or super still
  owns closeout
- `Open items for manager` with no direct pickup cue like `done` or `read your
  inbox`
- `done`/`read your inbox` guidance with no actual upward mail or inbox update
  behind it

## Final Rule

If another reader would still need to ask "okay, but what happens now?" or "do
I need to copy anything from this terminal?" the execution completion has not
been fully converted into closeout truth.
