# Turn Event Capture Policy

Use this to decide what must be event-logged for doctor-quality awareness.

## Always Capture

Capture one structured event when a user-facing turn changes:

- delivery mode
- recommendation state
- approval state
- next owner
- bridge mode
- buyer labor expectation
- frustration state
- closeout state
- lane lifecycle state

## Also Capture

Capture when:

- a lane becomes half-born, orphaned, paused, or closed
- a live self-correction happens
- a buyer restates the same truth twice
- doctor pushes a repair through to completion

## Do Not Capture

Do not log:

- trivial acknowledgements
- bare greetings
- duplicated restatements with no state impact

## Final Rule

If doctor would later need the turn to explain what happened, the event should
probably exist.
