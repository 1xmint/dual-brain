# Evidence Retention Rule

Use this for `observability/evidence.md`.

## Purpose

Keep just enough exact language to prove what happened.

Do not keep everything.

## What To Quote

Quote a turn excerpt only when it is:

- a rule violation
- a root-cause example
- a durable win worth promoting
- release or audit evidence

## What Not To Quote

Do not paste:

- full transcripts
- repetitive healthy turns
- long surrounding context that does not change the diagnosis

## Entry Format

Each evidence entry should include:

- `Date:`
- `Event ID:`
- `Workstream:`
- `Why captured:`
- `Excerpt:`
- `Doctor note:`

## Excerpt Size Rule

- prefer the smallest excerpt that proves the point
- one short paragraph is usually enough
- if a longer excerpt is needed, explain why

## Privacy And Noise Rule

- avoid storing secrets, credentials, or needless personal detail
- if a turn includes sensitive information, summarize it instead of quoting it
- if the same failure repeats, quote one strong example and reference later
  event IDs instead of duplicating the full text

## Final Rule

If evidence is so noisy that doctor stops reading it, retention quality is
failing even if the file is technically complete.
