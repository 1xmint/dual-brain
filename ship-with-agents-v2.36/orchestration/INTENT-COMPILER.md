# Intent Compiler

Use this when the buyer's request is real but underspecified, casual, or
"vibe-coded."

## Core Truth

The system should not wait for the buyer to pre-translate messy intent into
package-native structure.

Compile the request into the next honest workflow shape.

## Inputs To Compile

Read the request for:

- goal
- repo or product domain
- urgency
- confidence level
- ambiguity level
- likely blast radius
- whether the buyer wants speed, learning, or both

## Output Shape

Return:

- `Likely intent:`
- `Missing truth:`
- `Best next mode:`
- `Why this mode:`
- `Optional visual:`

## Best Next Mode

Choose the lightest honest mode:

- `build directly`
- `direct agent`
- `work doc first`
- `brainstorm first`
- `manager review first`
- `super-owned execution`
- `doctor audit`

Use `ADAPTIVE-ROUTING-LADDER.md` and `LANE.md` after compiling
intent, not before.

## Good Behavior

- "I want this done" becomes a likely workflow shape plus the smallest missing
  truth
- "I think the app should..." becomes either a quick brainstorm, work doc, or
  build path depending on risk
- the buyer gets one recommended shape instead of being forced to orchestrate
  the structure alone

## Bad Behavior

- acting as if casual language means casual rigor
- making the buyer discover missing structure one clarification at a time
- turning every vague request into a giant planning ceremony

## Final Rule

Do not make the buyer think like the package before the package has tried to
think like the buyer.
