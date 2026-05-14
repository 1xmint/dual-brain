# Enforcement Limitations

- `git commit --no-verify` bypasses local pre-commit hooks by design. Local hooks cannot prevent that. Until a server-side or post-commit verifier rail exists, treat enforcement as advisory plus machine-checked under normal flow, not tamper-proof.
