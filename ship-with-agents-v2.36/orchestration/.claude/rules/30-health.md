# Health Rule

- Use the health registry as a compact signal, not as a replacement for slices,
  checkpoints, or closeouts.
- Refresh health when ownership, pickup, readiness, or risk truth changes.
- Refresh health when review topology, manager load, or context purity changes.
- Treat `durably routed` and `actively picked up` as different states.
- Prefer explicit `yellow` or `red` over fuzzy optimism.
- If health and artifacts disagree, trust the artifacts and refresh health.
