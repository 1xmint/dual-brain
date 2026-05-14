---
argument-hint: [slice-path]
description: Close or pause a slice cleanly after review
---

Close out the slice at `$ARGUMENTS`.

Check:
- checkpoint or completion evidence
- approval state
- lane-state action
- expected next session if rotating
- whether ACTIVE-WORKSTREAMS and ACTIVE-CHAT-MAP need updates

Do not mark the slice `done` if closeout is still missing active-lane cleanup.
