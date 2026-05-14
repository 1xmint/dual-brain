# Second-Brain Diversity Gate

Use this before adding a second provider or second review surface.

## Core Truth

Provider diversity is useful only when it buys real independence.

Be explicit about which kind of diversity you are buying:

- `prompt-diverse`: same provider/model family, different role prompts or
  surfaces
- `provider-diverse`: meaningfully different provider or model family

It is not useful when:

- the second brain will restate the first
- the task is tiny
- copy overhead dominates
- capability truth is uncertain

## Good Reasons To Add A Diverse Second Brain

- fresh review context would likely catch different failure modes
- the main execution surface is strong at building but weak at independent audit
- the work is `A2` or `A3`
- the user explicitly values cross-provider checking

## Bad Reasons

- "we have another subscription"
- "more brains must be better"
- decorative brand balancing

## Decision Rule

Ask:

1. what unique check would the second surface perform?
2. is that check worth the overhead here?
3. is the user profile and budget posture compatible with this?

If those answers are weak, stay single-provider.

## Honesty Rule

Do not market prompt-diverse review as provider-diverse review.
If the current cell uses the same provider/model family with different prompts,
say `prompt-diverse`.

## Third-Brain Rule

If the system is considering a third brain, ask one more question:

- what unique independent check does the third brain add that the first two
  do not already cover?

If that function cannot be named plainly, do not add the third brain.
