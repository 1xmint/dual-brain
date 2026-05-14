# Change Event Schema

Use this for meaningful state changes that should inform more than one lane.

## Core Truth

Not every turn needs an event.
Meaningful coordination changes do.

## Event Types

Use events for changes like:

- review state moved materially
- recommendation settled
- blocker opened or cleared
- shared contract changed
- dependency satisfied
- topology changed
- workstream merged, split, paused, or closed
- important user frustration surfaced or resolved

## Minimum Fields

- `event id`
- `timestamp`
- `event type`
- `source lane`
- `workstream id`
- `repo slug`
- `summary`
- `impact radius`
- `affected lanes`
- `affected workstreams`
- `requires replan`
- `next owner`

## Final Rule

If a change should reshape another lane and no event exists, the system is
still depending too much on memory and luck.
