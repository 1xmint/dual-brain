---
name: think
description: Dual-brain architecture discussion — two-round Claude + GPT analysis
arguments:
  - name: question
    description: The architecture question or decision to analyze
    required: true
---

Run the dual-brain think flow (2 rounds) using the provided question:

**Round 1** — get GPT's independent analysis:
```bash
node hooks/dual-brain-think.mjs --question "<question>"
```

Analyze the same question independently, then run **Round 2** — share your analysis and get GPT's response:
```bash
node hooks/dual-brain-think.mjs --question "<question>" --round 2 --claude-says "<your analysis>"
```

Synthesize both rounds into a final decision, noting agreements, disagreements, and the chosen recommendation.
