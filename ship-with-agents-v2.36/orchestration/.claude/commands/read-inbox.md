---
description: Read the current runtime inbox and summarize only the relevant workflow changes
---

Read the current lane's runtime inbox first, then the smallest relevant update
index or watermark file.

Return:

1. if identity is unresolved, say `Lane identity unresolved:` and name the
   missing runtime surfaces instead of pretending the inbox was checked
2. otherwise, the workflow changes or handoffs that actually matter now
3. what behavior or ownership changes because of them
4. the next real move

Do not substitute backlog, salvage, or idea inboxes unless the buyer explicitly
asked for those.
