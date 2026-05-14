# Lightweight To Orchestration Walkthrough

This walkthrough shows the cleanest upgrade path from:

- simple repo memory and task packets

to:

- canonical slice docs
- orchestration install
- upgrade-safe runtime separation

## Phase 1: Lightweight Start

You have:

- one primary operator
- one execution tool
- occasional review help

Do:

1. read `../CHOOSE-YOUR-SETUP.md`
2. run `../bootstrap/bootstrap-lightweight.ps1`
3. run `../bootstrap/agent-system-doctor.ps1`
4. use:
   - `AGENTS.md`
   - `_agent-system-local/starters/task-packet.md`
   - `_agent-system-local/starters/chat-migration-packet.md`

Stop here as long as this still feels natural.

## Phase 2: The Work Outgrows Packets

Warning signs:

- the same work gets re-pasted across multiple chats
- review and launch packets drift apart
- you are reopening long-lived workstreams
- checkpoints and relaunches now matter

Do:

1. read `../orchestration/DOC-FIRST-ORCHESTRATION.md`
2. create one canonical slice doc from `../orchestration/slices/TEMPLATE.md`
3. keep chat text as commentary and slice docs as truth

You can do this before full orchestration if needed.

## Phase 3: Move To Full Orchestration

Only do this when the work now honestly needs routing.

Do:

1. run `../bootstrap/bootstrap-orchestration.ps1`
2. run `../bootstrap/agent-system-doctor.ps1`
3. read:
   - `../orchestration/QUICK-START.md`
   - `../orchestration/DOC-FIRST-ORCHESTRATION.md`
   - `../UPGRADE-GUIDE.md`

## What Changes

You now separate:

- `_agent-system/` = vendor truth
- `_agent-system-local/` = buyer-specific truth
- `_agent-system-runtime/` = live work truth

That means upgrades are safer and live state is less likely to get trampled.

## The Golden Rule

Do not upgrade to orchestration just because the package includes it.

Upgrade when:

- the work really needs routing
- the same artifact needs repeated review and relaunch
- chat transport is becoming the problem

That is the clean path from useful to powerful without turning the buyer into a
full-time workflow mechanic.
