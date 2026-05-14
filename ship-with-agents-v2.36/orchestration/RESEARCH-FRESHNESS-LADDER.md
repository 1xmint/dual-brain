# Research Freshness Ladder

Use this to decide how strongly external research is required.

## F0 - No Web Needed

Examples:

- stable repo-local refactor
- formatting or packaging work with no unstable external dependency

Action:

- stay local

## F1 - Nice To Have

Examples:

- confirming a pattern or library best practice
- optional broader-market context

Action:

- local work may proceed
- external browse can improve confidence

## F2 - Recommended

Examples:

- framework-version-specific work
- dependency behavior or tooling compatibility
- architecture decisions where docs or patterns may shift the path

Action:

- browse or route research before locking the recommendation

## F3 - Mandatory

Examples:

- auth, secrets, crypto, payments, privacy
- security-sensitive changes
- claims about current vendor/platform capabilities
- release or migration decisions that depend on live external truth

Action:

- browse or route research before claiming confidence

## Final Rule

Higher freshness risk should feel like a first-class gate, not an afterthought.
