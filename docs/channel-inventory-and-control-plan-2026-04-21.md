# Communication channel inventory and scoped control

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repo's ExecPlan discipline and records the channel-inventory slice that turned scoped guardrail editing into per-channel operator control.

## Purpose / Big Picture

Agentwall already had scoped guardrail editing, but it still could not show operators every Slack, Telegram, Discord, or other communication surface an agent was actively using. After this slice, the dashboard exposes an observed communication-channel inventory grouped by agent, and each observed channel has a direct `Control channel` path that seeds the scoped-guardrail editor for that exact agent/channel pair.

The user-visible proof is straightforward: `/api/dashboard/state` now includes `channelInventory`, the dashboard policy panel renders `Communication Channels`, and a request carrying `actor.channelId` shows up under the correct agent with a direct control action.

## Progress

- [x] (2026-04-21 06:23 UTC+8) Confirmed the missing capability: Agentwall understood `actor.channelId` for policy evaluation but discarded it from runtime inventory and operator surfaces.
- [x] (2026-04-21 06:23 UTC+8) Extended audit/runtime plumbing so `actor.channelId`, `actor.userId`, and `actor.roleIds` survive into runtime state.
- [x] (2026-04-21 06:23 UTC+8) Added `channelInventory` to dashboard state, grouped by agent and channel.
- [x] (2026-04-21 06:23 UTC+8) Added `Communication Channels` UI with `Control channel` actions that seed the scoped guardrail editor.
- [x] (2026-04-21 06:23 UTC+8) Verified with focused tests, full tests, and a clean TypeScript build.

## Surprises & Discoveries

- Observation: The core policy engine already had enough identity context for channel-aware enforcement, but the audit event did not preserve `actor`, so runtime observability had no channel memory.
  Evidence: `src/audit/logger.ts` originally emitted `metadata`, `provenance`, and `flow`, but not `actor`.

- Observation: The fastest control path was not a new route. It was using the existing scoped-rule editor and seeding it from observed channel inventory.
  Evidence: adding `Control channel` only required a browser-side preset plus the already-shipped `POST /api/dashboard/control/policy-scoped-rule` route.

## Decision Log

- Decision: Track observed channels from runtime audit and approval flows instead of trying to infer them from static policy files.
  Rationale: the user asked to see every communication channel the agent is actually in, which is runtime truth, not config theory.
  Date/Author: 2026-04-21 / Hermes

- Decision: Use `Control channel` to prefill the scoped-guardrail editor instead of inventing a second editor surface.
  Rationale: one editor is simpler, and per-channel control becomes immediate once the inventory can seed agent/channel scope automatically.
  Date/Author: 2026-04-21 / Hermes

## Outcomes & Retrospective

This slice is complete.

What shipped:

- `AuditEvent.actor` now preserves runtime channel identity context.
- runtime state tracks observed channels per agent with channel id, users, roles, sessions, last action, and risk.
- dashboard state exposes `channelInventory`.
- the policy panel now shows `Communication Channels` grouped by agent.
- each observed channel has a `Control channel` action that preloads the scoped guardrail editor for that agent/channel pair.

What remains:

- richer per-channel summaries such as message volume, decision history, and guardrail hit-rate
- delete/disable channel-scoped rules directly from inventory
- channel presets and naming normalization packs for Slack/Telegram/Discord

## Context and Orientation

The runtime control-plane state lives in `src/dashboard/state.ts`. Audit events come through `src/audit/logger.ts`. The policy editor and inventory routes live in `src/routes/dashboard.ts`. Browser rendering is in `public/app.js`, and the policy panel shell is in `public/index.html`.

The key concept here is runtime-observed channels. If a request carries `actor.channelId`, Agentwall should remember that this agent has been active in that channel and expose it to operators.

## Validation and Acceptance

Acceptance for this slice is behavioral:

- send `/evaluate` with `actor.channelId = slack:finance-room`
- fetch `/api/dashboard/state`
- observe `channelInventory.byAgent` contains the correct `agentId` and `channelId`
- load the dashboard and observe `Communication Channels`
- click `Control channel` and confirm the editor is prefilled with that agent/channel scope

## Artifacts and Notes

Verification commands that passed for this slice:

    npm test -- --runInBand tests/dashboard.test.ts tests/policy-runtime.test.ts
    npm test -- --runInBand
    npm run build

## Interfaces and Dependencies

Important payloads and surfaces after this slice:

- `AuditEvent.actor?: ActorScope`
- dashboard state includes `channelInventory.total`, `channelInventory.byAgent`, and `channelInventory.recent`
- policy UI includes `Communication Channels` and `Control channel`

Revision note: created to record the runtime-channel inventory/control slice after the broader scoped-guardrail editor shipped.