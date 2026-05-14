# Local Lessons

Use this file in `_agent-system-local/` for buyer-specific friction,
constraints, or operating truth that should not be overwritten by a
package upgrade.

Keep this focused on local truth, not vendor defaults.

## Example entries

- Local repo naming convention differs from the package default because
  ...
- This team uses lighter orchestration by default because ...
- This runtime has a known limitation around ...

## Rule

- If the lesson applies only to your project or team, keep it here.
- If the lesson is general enough to improve the package for future
  buyers, consider promoting it into the vendor package or your own
  fork later.
