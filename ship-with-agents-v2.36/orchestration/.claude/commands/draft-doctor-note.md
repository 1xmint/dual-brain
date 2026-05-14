# /draft-doctor-note

Use this when doctor or another quality lane should provide a compact,
immediately usable correction note.

## Do

1. identify the exact broken behavior
2. identify the smallest repair instruction
3. choose the right note target:
   - lane
   - buyer
   - internal repair only
4. produce one compact note block

## Output

Use one of:

- `Doctor note for <display-name> (<role>):`
- `Doctor note for buyer:`
- `No user action needed:`

Include:

- the correction
- the expected next move
- one "do not repeat" line only if it adds real clarity

## Rule

A doctor note should reduce confusion immediately.
If it reads like an audit essay, it is the wrong format.
