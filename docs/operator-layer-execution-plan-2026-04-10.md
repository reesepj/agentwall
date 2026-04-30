# Mission Control Operator Layer Execution Plan

> Goal: turn the Knowledge Base into an operator system that notices, triages, routes, and follows through so Mission Control reduces real attention load instead of just displaying information.

## Product thesis

The KB gives truth.
The operator layer gives action.

Success is not "more panels."
Success is this:
- Reese can open Mission Control and know what matters in under 60 seconds
- incoming noise gets classified before it becomes manual routing work
- important work resurfaces until it is actually resolved
- low-risk routine handling happens automatically with an audit trail

## Ruthless priority order

### Phase 1 — Daily command surface
Objective:
Ship the default Mission Control pane that answers:
- what matters today
- what is waiting
- what is risky
- what needs approval
- what was already cleared

Why first:
This creates daily utility immediately, even before deeper automation is complete.

Scope:
- server-side derived command deck
- Today / Waiting / Risks / Approvals / Auto-handled panes
- command items linked back to real drilldowns when possible
- seeded empty-state guidance when the runtime is idle

Done when:
- operator can scan the top surface in under 60 seconds
- top items map to real runtime state, not placeholder prose
- tests lock both seeded and live states

Current status:
- in progress
- first slice shipped on 2026-04-10: command deck added to dashboard state + UI with verified tests/build

### Phase 2 — Unified intake spine
Objective:
Pull all inbound work through one classification path.

Scope:
- intake model for Telegram, webhook, notes, alerts, email later
- classification buckets: ignore, archive, awareness, action, auto-handle
- source tags: ops, security, finance, research, personal, admin
- dedupe and thread merge
- confidence score + explicit escalation path

Done when:
- most inbound items are pre-sorted without manual routing
- Mission Control can show one normalized intake queue instead of source-specific clutter

### Phase 3 — Closed-loop follow-through
Objective:
Make work persistent until resolved.

Scope:
- owner
- status
- blocked reason
- resurface date / rule
- stale-item detection
- "still waiting on X" prompts
- follow-up loop tied to context, not dumb timers

Done when:
- important work stops disappearing after the first pass
- waiting work automatically returns to Today when conditions are met

### Phase 4 — Delegation and routing engine
Objective:
Make Mission Control the router so Reese stops doing dispatch manually.

Scope:
- Hermes handles small, safe, local work
- Pi/Codex/subagents receive scoped missions
- approvals only when stakes or ambiguity justify interruption
- route outcomes back into Mission Control state

Done when:
- delegated work shows up in Waiting with ownership and last movement
- only real tradeoffs escalate to Reese

### Phase 5 — Personal life ops lane
Objective:
Apply the same operator loop to life admin, not just project ops.

Scope:
- recurring reminders
- appointment prep
- vehicle/home maintenance
- document and receipt tracking
- follow-up prompts
- personal admin backlog

Done when:
- Mission Control reduces ambient chaos outside work too

### Phase 6 — Controlled auto-execution
Objective:
Let the system resolve low-risk work autonomously with visible audit trails.

Scope:
- archive noise
- create/update tasks
- summarize threads
- reroute alerts
- prepare drafts
- run routine checks
- permission policy for what is allowed, gated, or forbidden

Done when:
- a meaningful share of routine work clears without supervision
- every autonomous action is reviewable

## Engineering sequence

### Track A — Operator surface
1. Command deck
2. Better pane scoring/ranking
3. Daily brief view
4. Interrupt policy and quiet-mode rules

### Track B — Intake and state
1. Normalized intake event model
2. Source adapters
3. Classification pipeline
4. Duplicate suppression and thread grouping

### Track C — Follow-through
1. Work item state machine
2. ownership and blocked reasons
3. resurfacing scheduler
4. stale-work detection

### Track D — Delegation
1. mission envelope schema
2. agent routing rules
3. execution result ingestion
4. escalation policy

## Immediate build slices

### Slice 1 — Command deck shell
Status: done

Delivered:
- added `commandDeck` to dashboard API response
- added dashboard panel for Today / Waiting / Risks / Approvals / Auto-handled
- seeded and live-state tests
- full test suite + build green

### Slice 2 — Make command deck less runtime-only
Next

Build:
- command deck should ingest KB-backed open questions and operator TODOs, not only runtime signals
- add a small server-owned item type for `source` so cards can show whether something came from runtime, KB, or system tasking
- add deterministic ranking rules for Today so the hottest cross-source item always stays pinned

Files:
- `src/routes/dashboard.ts`
- `src/dashboard/state.ts`
- `public/app.js`
- `tests/dashboard.test.ts`

### Slice 3 — Introduce normalized intake items
After slice 2

Build:
- add internal intake item shape
- seed it first from runtime events + approvals
- render an intake queue that can later absorb Telegram/webhook/email without redoing UI contracts

### Slice 4 — Follow-through state
After intake

Build:
- add work-item fields: owner, status, blockedBy, resurfaceAt, sourceRef
- expose Waiting from follow-through state instead of ad hoc derivation

## Guardrails

Do not do these early:
- fancy agent personalities
- broad integrations before the intake model exists
- autonomous execution without auditability
- analytics panels that do not change decisions
- another generic chat surface pretending to be Mission Control

## Verification standard

Every slice must prove:
- seeded state is honest
- live state is honest
- UI is rendering real data, not decorative copy
- drilldowns or next actions point somewhere real
- `npm test -- --runInBand`
- `npm run build`

## What to build next

Next best move:
finish Phase 1 before touching intake.

That means the next implementation slice is:
make the command deck pull from more than runtime pressure so it becomes the true default operator surface.
