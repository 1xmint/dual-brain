# ADR-NNNN: `<short-decision-title>`

```
Status: <proposed | accepted | superseded>
Date: YYYY-MM-DD
Deciders: <name or role>
Supersedes: <ADR-number-or-none>
Superseded by: <ADR-number-or-none>
```

An ADR (Architecture / Architectural Decision Record) captures a decision that future readers will ask "why?" about. Keep one decision per ADR. Keep it short.

Good candidates for an ADR:

- why a repo boundary exists where it does;
- why a stack / framework / tool was chosen;
- why a particular deploy or branching model is used;
- why a known alternative was rejected;
- why a security or trust model looks the way it does.

Not a good ADR: minor style preferences, one-off task decisions, anything covered by a single PR.

## Context

Describe the situation that forced a decision. What was true before? What pressure led to needing a choice?

Keep this factual. No rhetoric.

## Decision

One paragraph. State the decision plainly, in the present tense.

> Example: "We use Postgres as the single primary datastore for all application state. Caching and search sit on top, not beside."

## Consequences

Honest. Both directions.

**Positive**

- `<what gets easier, safer, cheaper, clearer>`;
- `<what gets easier, safer, cheaper, clearer>`.

**Negative**

- `<what gets harder, more expensive, or more fragile>`;
- `<what we lose by doing this>`.

**Neutral**

- `<any non-obvious follow-on behavior>`.

## Alternatives Considered

At least two, with the short reason each was rejected.

- **Alternative A:** `<short description>` — rejected because `<reason>`.
- **Alternative B:** `<short description>` — rejected because `<reason>`.

## Follow-Up

What this ADR causes to happen next.

- docs to update: `<paths>`;
- code surfaces affected: `<areas>`;
- any migration or deprecation work: `<short description>`;
- any future re-evaluation trigger: `<what would make us revisit this>`.

## Notes

Anything the next reader would thank you for — links to the original proposal, to prior art, to a relevant incident, to a benchmark. Do not dump chat history here. Summarize.
