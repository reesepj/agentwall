# Agentwall Runtime FloodGuard (Anti-Flood / Anti-DDoS)

## Feature definition in Agentwall terms

**Runtime FloodGuard** is an inline protection layer for Agentwall control-plane APIs (`/evaluate`, `/approval/request`, `/approval/:id/respond`) that defends agent systems from:

1. **Request floods** — high-rate policy checks that starve runtime
2. **Tool abuse floods** — repeated high-risk tool actions (e.g. shell loops)
3. **Approval floods** — mass approval requests intended to overwhelm operators
4. **Queue floods** — unbounded pending-approval backlog growth
5. **Cost floods** — sustained behavior that drives hidden runtime/cognitive spend

FloodGuard is not a replacement for policy. It is a **rate + queue + budget safety envelope** around policy and approvals.

## Why this matters (product differentiator)

Most agent security products stop at policy decisions. Agentwall can differentiate by adding **operational survivability controls**:

- Policy can say “approve”, but FloodGuard can still prevent approval queue collapse.
- Policy can allow benign requests, but FloodGuard can still block volumetric abuse.
- Operators get continuity under attack, not just better logs after failure.

This positions Agentwall as **policy + runtime resilience**, not policy-only.

## MVP slice implemented

Initial safe slice implemented in code:

- `src/runtime/floodguard.ts`
- integrated into:
  - `POST /evaluate`
  - `POST /approval/request`
  - `POST /approval/:requestId/respond`
- new config surface in `AgentwallConfig.runtimeGuards` with defaults:
  - session request rpm caps
  - per-tool-action rpm cap
  - approval request/response rpm caps
  - global + per-session pending queue caps
  - per-session hourly cost budget (weighted)
- 429 responses include reason + `retry-after` where applicable
- test coverage in `tests/floodguard.test.ts`

## Highest-leverage controls and UI surfaces (next)

### Controls

1. **Adaptive throttles** (per-agent/session dynamic ceilings)
2. **Burst-to-drain queue mode** (queue pressure engages stricter admission)
3. **Circuit breaker states** (normal / constrained / shield / locked)
4. **Per-tenant budget partitions** (prevent one tenant from consuming all budget)
5. **Manual override windows** (operator can temporarily raise/lower limits)

### Dashboard/UI surfaces

1. **FloodGuard status card**
   - current mode
   - open queue pressure
   - blocked requests last 5m
2. **Guard events timeline**
   - every 429 with reason class: request/tool/approval/queue/cost
3. **Budget heatmap**
   - session-level cost burn-rate vs threshold
4. **One-click controls**
   - “enter shield mode for 10m”
   - “raise approval cap for session X”

## Exact next implementation tranche

**Tranche B status:** mostly landed.

Implemented in this tranche:
1. **FloodGuard telemetry surfaced in dashboard state**
   - blocked counts by category
   - top sessions by pressure
2. **Shield mode** in runtime + API
   - tighter limits under shield
   - one-click dashboard control
3. **Approval queue prioritization**
   - higher-risk approvals ordered first in dashboard state
4. **Operator-facing controls** in `/api/dashboard/control/*`
   - set mode normal/shield
   - set temporary per-session override
   - clear temporary per-session override

What remains after Tranche B:
1. richer guard-event timeline views in the dashboard
2. stronger operator guidance for when to enter shield mode
3. optional policy/timeboxed handling for low-risk queue items
4. operator presets for lifting or constraining multiple sessions at once

Recent operator-facing win:
- active session cards now show FloodGuard override state and expiry directly in the workbench, so operators do not have to infer whether a temporary boost is still live
- FloodGuard now emits operator guidance in dashboard state, including when shield mode should be turned on, which session is hottest, and what to clear before returning to normal mode
- the CLI now mirrors the live control API for status, shield/normal mode, per-session boost/reset, and direct pause/resume/terminate controls
- `agentwall status` now prints that FloodGuard guidance directly in terminal form, including the recommended next move, pressure percentage, hottest session, and remaining session-override window, so runtime tuning is usable without bouncing between the shell and dashboard
- the shell and dashboard FloodGuard surfaces now also call out the hottest guard categories, the top pressured sessions, and the latest live block reason so operators can see what is actually tripping the guard before they start flipping controls
- the CLI top queue now carries each item's next operator action plus concise risk/wait context, so shell-first approval triage is not just a title list

### Live-control verification flow

Use this when validating the operator path end to end against a running Agentwall instance:

```bash
npm test -- --runInBand
npm run build
AGENTWALL_CONFIG=examples/openclaw-monitor-first.config.yaml node dist/index.js
```

In another shell:

```bash
agentwall status --url http://127.0.0.1:3015
agentwall approval-mode always --url http://127.0.0.1:3015
agentwall shield --minutes 5 --url http://127.0.0.1:3015
agentwall session-boost --session live-session --multiplier 1.5 --minutes 15 --url http://127.0.0.1:3015
agentwall session-reset --session live-session --url http://127.0.0.1:3015
agentwall terminate live-session --confirm --note "Containment" --url http://127.0.0.1:3015
agentwall normal --url http://127.0.0.1:3015
```

If you need to verify `pause`, `resume`, or `terminate`, create a live session first with `/evaluate` or a real runtime request. A `404 Session not found` from those commands means the CLI path worked but the target session does not exist yet.
If you terminate a session, Agentwall treats that as hard containment. A later `resume` returns `409` and operators should start a new runtime session instead of reopening the terminated one.
Terminate is also confirmation-gated end to end now: the CLI needs `--confirm`, and dashboard/API terminate requests must include explicit confirmation before hard containment executes.

`agentwall status` now also prints the exact live control target plus CLI next moves that preserve `--url` or `--config` when you used one, so the suggested follow-up commands stay copy-pasteable against the same Agentwall instance.
The mutating live-control commands now echo that resolved target on success too, so shell-side tuning logs keep showing which Agentwall instance was actually changed.
When the operator is driving a remote or proxied instance, the status header keeps the explicit `--url` target in view and only annotates the server-advertised bind address, instead of silently swapping back to `0.0.0.0` or another internal listener address.
When pressure falls back to normal, those next moves now shift from containment suggestions to cleanup suggestions, including `agentwall approval-mode auto` and `agentwall session-reset <session>` for any still-active temporary override.
That normalization stays conservative: if paused or terminated sessions are still waiting on operator review, the CLI keeps those cleanup suggestions quiet instead of nudging the operator to relax posture too early.

Success criteria for Tranche B:

- Under synthetic flood, Agentwall remains responsive for operator actions.
- Dashboard shows real-time guard pressure and blocked reason categories.
- Approval queue remains bounded and triaged by risk.
