# Doctor Severity Model

Use this to keep doctor findings proportional.

## Severity Levels

- `P0` - release-blocking trust defect
- `P1` - major workflow, quality, or recovery regression
- `P2` - material friction, misleading guidance, or repeatable confusion
- `P3` - polish, clarity, or nice-to-have improvement

## Decision Rule

Ask:

1. can this cause a wrong launch, wrong owner, false completion, or lost truth?
2. can this stall meaningful production?
3. can this mislead the buyer or active lanes?
4. is the impact local or cross-system?

Map severity accordingly.

## Practical Guidance

- use `P0` sparingly
- use `P1` for real trust or execution-shape defects
- use `P2` for meaningful friction that should not be normalized
- use `P3` for improvements that matter, but are not currently distorting work

Severity should affect:

- how hard the fix path should be
- whether release or fixture coverage is warranted
- how broadly the update should propagate
