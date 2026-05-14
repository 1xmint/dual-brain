# Updates Runtime

This folder holds starter files for the live runtime update bus.

When bootstrapped into `_agent-system-runtime/updates/`, it gives the buyer one
place to publish workflow changes and let lanes consume them locally.

## Files

- `UPDATE-FEED.md` = canonical chronological update log
- `UPDATE-INDEX.md` = compact summary of active/recent updates
- `UPDATE-WATERMARKS.md` = what each lane last saw or acknowledged
- `inbox/` = targeted lane, role, or lineage inboxes

## Publishing Rule

1. append the update to `UPDATE-FEED.md`
2. add or refresh a compact entry in `UPDATE-INDEX.md`
3. route the update into only the relevant inboxes
4. update `UPDATE-WATERMARKS.md` when lanes acknowledge the change

## Lane Rule

Lanes should check the update bus at fixed moments, not every response:

- startup
- resume
- major compact/rotation
- before launch
- before closeout

See `../UPDATE-BUS.md` for the full behavior rules.
