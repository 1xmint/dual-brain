# Legacy Live ID Migration

Use this when the live system still has older compact or mixed-semantics lane
IDs that cannot be renamed immediately.

## Core Truth

Do not rename active lanes midstream just to make the naming system prettier.

Instead:

- preserve the live lane ID
- surround it with clearer workstream and progression metadata
- migrate future lanes to the clearer model

## Final Rule

Operational continuity beats cosmetic cleanup.
But cosmetic debt should be offset by stronger live metadata immediately.
