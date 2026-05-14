# Staged Edit Protocol

Use this when changing shared prompt files, rule files, manifests, sync maps,
cross-linked docs, or other system/package surfaces where one large edit can
fail messily.

This exists because "one giant patch" is often the wrong unit for system
surgery.

## Core Truth

Big semantic change can still require small verified edit steps.

Default to staged verified chunks when editing:

- shared buyer-facing orchestration files
- long markdown rule files
- manifests, sync maps, changelogs, or migration docs
- files with odd encoding or formatting history
- anything with many cross-references

Do not treat a large unified patch as inherently better just because the final
intent is coherent.

## Not A Blanket Rule

This does **not** mean every edit must be tiny.

A larger one-pass edit is still fine when:

- the surface is isolated
- the file is clean and low-risk
- verification is straightforward
- failure would be easy to detect and repair

The rule is:

- chunk by risk boundary
- not by superstition

## When Staging Is Preferred

Prefer staged verified pieces when any are true:

1. one edit touches multiple shared docs
2. public and internal mirrors must stay aligned
3. the file has many headings or repeated patterns
4. the edit changes both wording and structure
5. the file has legacy encoding quirks
6. a failed patch would leave unclear partial state
7. release metadata must be kept in sync

## Preferred Flow

1. change the core rule or canonical file first
2. verify that edit
3. propagate to mirrored/shared files
4. verify again
5. update metadata last
6. run release checks after the content is stable

This keeps breakage localized and easier to reason about.

## Verification Boundaries

Good verification boundaries include:

- one file updated cleanly
- one mirrored pair updated cleanly
- one section added and visible
- one metadata layer synced
- cross-ref and sync audit still passing

Do not wait until the very end to discover that a giant edit partially failed.

## Human-Facing Interpretation

If you need to explain the behavior, say:

- "I’m applying this in smaller verified pieces because the surface is shared
  and cross-linked."

Do not frame it as:

- "the model can’t handle big edits"

The issue is surface risk, not ego.

## Anti-Patterns

- one huge patch across prompts, templates, manifest, changelog, and sync map
  with no intermediate verification
- retrying the same brittle bulk edit after a partial mismatch
- patching metadata before the core content is stable
- treating a legacy markdown failure as proof the final idea was wrong

## Final Rule

For risky system/package/doc edits:

- small verified pieces are the default
- larger one-pass edits are the exception

The goal is not slower editing.
It is cleaner failure boundaries and more trustworthy releases.
