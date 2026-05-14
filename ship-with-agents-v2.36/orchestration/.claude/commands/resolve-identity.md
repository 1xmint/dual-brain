---
description: Resolve a lane reference to its canonical runtime identity
---

Resolve the current lane or referenced lane to one canonical record using:

1. `ACTIVE-CHAT-MAP.md`
2. `ACTIVE-WORKSTREAMS.md`
3. `health/workstreams.json`
4. `updates/inbox/`
5. lane brain capsule if present

Return:

- display name
- stable lane
- routing id
- role
- owner lane
- inbox path
- lifecycle state
- workstream linkage
- ambiguity: yes/no
- known truth used
- missing truth

Do not fill missing fields from memory when runtime truth should answer them.
