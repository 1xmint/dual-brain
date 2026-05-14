# Remote Session Bridge

Use this when a remote service hosts long-running Claude Code, Codex, or other
repo-aware AI sessions in the cloud.

This file is intentionally vendor-neutral.

It exists so future tools can plug into the package without becoming a second
operating system.

## Core Truth

Remote sessions are still just lanes.

They do not get special permission to hide truth in a private cloud chat or
tool transcript.

For this package:

- local slice remains planning truth
- remote session becomes execution or review surface
- local checkpoint remains returned execution truth
- local closeout remains final lane truth

## Minimum Requirements For A Good Remote Session Tool

The tool should make it possible to know:

- stable session identity
- provider and model in use
- repo or snapshot source
- working directory or workspace identity
- last heartbeat or last successful activity
- how logs or status are retrieved
- how the session is resumed
- how it writes back a result

If those are fuzzy, the tool is not integrated enough yet.

## Required Package Fields

When you launch a remote session, record:

- session id
- role
- source repo or branch
- checkpoint path
- closeout expectation
- expected return artifact
- owner lane

Use `templates/REMOTE-SESSION-HANDOFF.md`.

## Recommended Flow

1. approve one bounded slice
2. open one remote session against that slice
3. let the remote session do bounded work
4. return one exact checkpoint or blocker artifact
5. update closeout and update-bus only if needed

Do not let remote convenience erase local discipline.

## Good Use Cases

- long-running cloud execution where local machine uptime is unreliable
- remote Claude Code or Codex lane attached to a clean workspace
- environment-specific testing that belongs near hosted services
- overnight or long autonomous runs with a clear stop condition

## Bad Use Cases

- using a remote session tool just to avoid checkpoint discipline
- letting remote logs replace package checkpoints
- opening many anonymous remote lanes with no ownership map
- assuming the rest of the system "just knows" what happened remotely

## Update Propagation Rule

Other chats do not automatically know what a remote session learned.

If the remote run changes workflow or next actions:

- update the checkpoint
- update the closeout if needed
- publish to the update bus if it changes lane behavior

That is the bridge.

## Final Rule

Remote execution is only integrated when local truth stays current without
requiring people to reconstruct meaning from the cloud transcript.
