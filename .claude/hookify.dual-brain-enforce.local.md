---
name: dual-brain-security-file-warn
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: auth|credential|secret|token|\.env(\.|$)|password|oauth|jwt|api.?key
---

**[Dual-Brain]** Security-sensitive file edit detected.

Security and credential changes require dual-brain think consensus before implementation:

1. Round 1: `node .claude/hooks/dual-brain-think.mjs --question "..."`
2. Analyze independently, then Round 2: `node .claude/hooks/dual-brain-think.mjs --question "..." --round 2 --claude-says "..."`
3. Synthesize both rounds into a final decision

Do not proceed with auth/credential/token/secret edits without this flow.
