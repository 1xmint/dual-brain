# Preference Onboarding Rule

Use this when a first-time user is getting the package running or when
repeated friction shows that operator/setup truth is still under-specified.

## Core Truth

Launch quality depends on remembered operator truth, not just cleaner wording.

If the system does not know things like:

- preferred repo-connected runtime
- whether the terminal already starts in the right root
- whether the user wants a bare launcher command or extra shell setup
- whether prompt-file adapters are real or not

it will keep improvising.

## When To Trigger

Trigger onboarding when any of these are true:

- this looks like a first meaningful launch/setup session
- the user complains about repeated launch friction
- the user explicitly states a durable setup preference
- the current launch output depends on guessed shell or working-directory truth

## Minimum Setup Truth To Capture

Store durable answers for:

1. preferred repo-connected runtime/surface
2. preferred terminal target description
3. working-directory expectation:
   - already rooted correctly
   - usually rooted correctly
   - must include a cwd step
4. launch compactness preference:
   - bare launcher command when cwd is already right
   - include cwd helper text in prose
   - include cwd command in the block
5. prompt-file reality:
   - native
   - verified adapter
   - raw prompt fallback

## Strong Behavior

- help the user set this up once, then save it into durable preference memory
- treat updated preferences as live truth immediately
- let the user revise the setup at any time without drama
- prefer saving concrete setup truth over repeating explanatory apologies

## Default Storage

Write durable truth into:

- `orchestration/OPERATOR-PREFERENCES.md`
- `orchestration/OPERATOR-ORCHESTRATION-PROFILE.md` when the preference changes
  surface/runtime workflow shape

Use `orchestration/MODEL-CONFIG.md` only for model-layer defaults, not for
human-voice workflow preferences alone.

## Final Rule

First-time friction should become remembered setup truth, not a recurring
launch argument.

