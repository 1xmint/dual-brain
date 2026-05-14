# Install Config

Fill this out if you want your system to know where vendor files end,
where local config lives, and where runtime state lives.

## Install Mode

- Install mode: [simple-in-place / safe-upgrade / advanced-customized]

## Folder Truth

- Vendor layer path: [e.g. `_agent-system/`]
- Local layer path: [e.g. `_agent-system-local/`]
- Runtime layer path: [e.g. `_agent-system-runtime/`]

## Runtime Paths

- Active workstreams index: [path]
- Checkpoints directory: [path]
- Checkpoint events directory: [path]
- Closeouts directory: [path]
- Logs directory: [path]
- Archive directory: [path]

## Naming Truth

- Uses phase tags?: [yes / no]
- Phase style: [p1/p2, w1/w2, day0/day1, custom]
- Stable lane key style: [default `head-<N>`, `super-<N>-<slug>`,
  `agent-<N>-<workstream>`, `doctor-<N>-<slug>`, `brainstorm-<N>-<slug>`]
- Continuation tokens: [default `--run<N>` / `--recover<N>` or custom]

## Model / Control Truth

- Can this runtime show current model directly?: [yes / no / sometimes]
- Can helpers be pinned to a different runtime reliably?: [yes / no / unknown]
- Exact-control path: [manual terminal launch / direct helper acceptable]

## Notes

- Add any project-specific truth future chats should read before making
  path, upgrade, or storage assumptions.
- Pair this with `ENABLED-MODULES.md`, `LOCAL-LESSONS.md`, and
  `LOCAL-WINS.md` if you want upgrades to preserve your own evolving
  workflow truth.
