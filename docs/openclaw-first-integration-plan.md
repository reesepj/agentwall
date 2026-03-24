# Agentwall → OpenClaw first integration plan

This is the first practical rollout path for turning Agentwall into real security infrastructure for an OpenClaw environment without breaking live operations.

## Goals

1. Insert Agentwall at the safest control points first
2. Start with observation and explicit approval, not broad blocking
3. Focus policy on the highest-risk planes first
4. Keep live gateway changes optional until the policy feed is trustworthy

---

## Recommended first insertion points

These are ordered from safest / easiest to most invasive.

### 1) Network preflight for outbound egress (`/inspect/network`) — start here

**Why first:**
- low blast radius
- easy to mirror before enforcement
- immediately useful against SSRF, private-range access, metadata endpoints, and accidental open egress

**What to send to Agentwall:**
- `web_fetch` URLs
- `web_search` result follow-on fetches
- browser navigations to new origins
- any direct HTTP client usage from custom tools or wrappers

**Monitor-first behavior:**
- call `/inspect/network` before the real request
- log the result next to the real action
- do **not** block yet unless Agentwall returns clearly critical categories already considered universally unsafe (for example cloud metadata / private range)

**Production note:**
If only one insertion point ships first, ship this one.

### 2) Tool execution evaluation (`/evaluate`, plane=`tool`) — high value, narrow scope

**Why second:**
- shell / exec is one of the highest-risk planes in OpenClaw
- the current built-in rules already understand exec/delete/write risk patterns
- this can begin as audit-only around dangerous tools without wrapping every tool call yet

**Best first events to send:**
- `exec`
- future privileged host commands
- destructive file operations
- install/update operations

**Monitor-first behavior:**
- emit evaluate events for dangerous tool actions
- keep human approval as the decision destination, but initially do not auto-wire Agentwall's response into hard blocking for all tool calls
- compare decisions against current OpenClaw safety policy to tune false positives

### 3) Identity / secret access evaluation (`/evaluate`, plane=`identity`) — protect the crown jewels early

**Why third:**
- secret access is lower-volume and high-signal
- credential reads are exactly the kind of event you want durable audit + approval for

**Best first events:**
- 1Password / `op` access
- environment-secret reads for external API tokens
- any secret / credential / vault access wrappers

**Monitor-first behavior:**
- require explicit approval in Agentwall policy examples
- start by auditing and surfacing approval requests rather than hard-failing existing flows

### 4) Browser action evaluation (`/evaluate`, plane=`browser`) — targeted, not universal

**Why fourth:**
- browser automation is risky, but noisy if instrumented too broadly too early
- better to gate only clearly sensitive actions first

**Best first events:**
- OAuth consent flows
- file uploads
- form submission to unfamiliar origins
- destructive account actions
- payment / billing surfaces

**Monitor-first behavior:**
- send only final high-impact actions first, not every click

### 5) Manifest integrity + watchdog — observe before enforce

**Manifest integrity:**
- hash tool / MCP manifests at startup or deploy time
- record approved fingerprints
- surface drift in audit and approval queues
- do not auto-disable live tooling on first rollout unless drift is severe and operator-confirmed

**Watchdog:**
- start in `monitor` kill-switch mode
- use heartbeat status for visibility and operator triage
- only move to `approve_only` after the signal is trusted
- reserve `deny_all` for later hardening

---

## Monitor-first rollout path

### Phase 0 — lab / sidecar only

Run Agentwall as a sidecar service bound to loopback.

- bind to `127.0.0.1`
- leave OpenClaw gateway unchanged
- generate audit events from mirrored requests only
- confirm rule quality and dashboard usefulness

### Phase 1 — egress mirror + critical hard stops

Integrate only network preflight around outbound requests.

**Enforce immediately:**
- private / loopback targets
- cloud metadata endpoints
- malformed URLs with embedded credentials when policy says block

**Still monitor-only:**
- default-deny allowlist misses for normal internet destinations
- approvals caused by untrusted content driving egress

This gives a strong SSRF floor without taking down normal automation.

### Phase 2 — high-risk tool and identity events

Mirror all of these to `/evaluate`:
- `exec`
- shell-like tool usage
- secret / credential access
- manifest drift findings

**Operator action:**
- review pending approvals
- tune policy examples into environment-specific rules
- create allowlists for normal safe operations

### Phase 3 — guarded mode for selected actions

Begin enforcing Agentwall results for:
- credential access
- manifest drift
- browser OAuth / payment actions
- clearly destructive cross-boundary actions

Keep ordinary low-risk writes and routine browser actions outside enforcement until the event model is stable.

### Phase 4 — expand coverage

Once confidence is high:
- add more browser action hooks
- add per-agent or per-session policy scoping
- move watchdog from `monitor` to `approve_only`
- consider inline proxying for broader network control later

---


## New guard-rail foundations to wire first

### Channel / user / role scope

Agentwall can now match on:
- `actor.channelId`
- `actor.userId`
- `actor.roleIds[]`

That gives OpenClaw a first real guard-rail primitive for policy like:
- shared channel is answer-only
- moderators can inspect but not execute shell
- owner direct chat can request credential access with approval
- a risky role or temporary incident room can be frozen without freezing every session

**Practical mapping:**
- Telegram DM: `channelId=telegram:direct:<chatId>`, `userId=<userId>`, roles like `owner` or `trusted-user`
- Telegram group: `channelId=telegram:group:<chatId>` plus roles like `member`, `moderator`, `operator`
- Discord thread/channel: `channelId=discord:<channelId>` and platform roles normalized into stable role ids/names

### Degraded execution modes

Agentwall now has a concrete per-request control-plane field:

```json
"control": {
  "executionMode": "normal | read_only | answer_only",
  "reason": "incident containment / rollout freeze / shared-channel safety",
  "enforcedBy": "mission-control"
}
```

Recommended semantics:
- `normal`: no extra containment beyond policy
- `read_only`: allow inspection and reasoning, deny mutating tool actions
- `answer_only`: deny external execution planes entirely (`network`, `tool`, `browser`, `identity`, `governance`) while still allowing the caller to return a conversational answer

These modes are intentionally separate from the watchdog kill switch. Watchdog is host/service liveness containment; execution mode is operator or workflow containment.


## Highest-risk planes and initial policy posture

### Network

**Initial posture:**
- deny SSRF / metadata / private ranges
- deny by default at the egress layer, but operational rollout starts as monitor-first except for universally unsafe destinations
- explicitly allow known AI / ops APIs
- require approval when untrusted or derived content drives egress

### Tool

**Initial posture:**
- approve shell / terminal / exec
- approve delete/remove/unlink
- audit writes and creates as medium risk
- approve manifest drift

### Identity

**Initial posture:**
- approve all credential / token / secret / vault access
- emit durable audit for every request

### Browser

**Initial posture:**
- deny payment / billing submission
- approve OAuth authorization
- approve uploads and unfamiliar-origin submits once those hooks exist in the caller

### Governance

**Initial posture:**
- log all governance actions
- deny governance changes during watchdog timeout / kill-switch engagement

---

## Concrete OpenClaw mapping

Translate OpenClaw activity into Agentwall contexts like this:

### `web_fetch` / HTTP calls
- `plane: network`
- `action: http_request`
- `payload.url: <target>`
- `flow.direction: egress`
- add `external_egress`, `cross_boundary` where appropriate
- provenance should reflect whether the URL came from user, web content, tool output, or memory

### `exec`
- `plane: tool`
- `action: exec`
- `payload.command: <shell>`
- `actor.channelId`, `actor.userId`, `actor.roleIds` from the active chat/session identity
- `control.executionMode` from Mission Control / operator state
- include `destructive_action` if command mutates or deletes
- include provenance describing what caused execution

### secret access / 1Password
- `plane: identity`
- `action: credential_read` or `secret_access`
- `actor.channelId`, `actor.userId`, `actor.roleIds` from the requesting surface
- `control.executionMode` from Mission Control / operator state
- `flow.labels: ["credential_access"]`
- provenance should say whether the request came from direct user intent, system workflow, or external content

### browser navigation / submit / oauth
- `plane: browser`
- `action: navigate | submit | authorize | upload`
- `actor.channelId`, `actor.userId`, `actor.roleIds` from the active surface
- `control.executionMode` from Mission Control / operator state
- `payload.url`, `payload.origin`, `payload.formSummary`
- `flow.direction: egress`
- provenance should include whether target/origin came from web content or direct user instruction

---

## Operational recommendations for OpenClaw deployments

- Treat Agentwall as a policy oracle first, not as an automatic kill-switch.
- Keep the first live rollout local-only and reversible.
- Use one or two real workflows first:
  - outbound web research
  - secret retrieval for approved ops tasks
- Do not front the entire live gateway with a hard deny policy on day one.
- Prefer `approval.mode: auto` while mirroring, then tighten once the queue is understandable.

---

## What remains after this repo change set

Still needed outside this repo:

1. wire `src/integrations/openclaw/web-fetch-egress.ts` into OpenClaw's native `web_fetch` tool path (the wrapper is implemented; direct gateway patch still pending)
2. Mission Control or gateway-side source of truth for execution-mode state (`normal` / `read_only` / `answer_only`)
3. real environment allowlists for approved hosts
4. manifest fingerprint collection for actual tool / MCP manifests in the target stack
5. heartbeat source wiring from OpenClaw sessions into Agentwall watchdog state
6. operator workflow for acting on approvals, drift findings, and scoped containment changes



## Reference adapter contract (implemented)

Concrete OpenClaw-facing insertion points now exist in this repo:

- `src/integrations/openclaw/preflight.ts`
- `src/integrations/openclaw/web-fetch-egress.ts`

They provide a monitor-first wrapper API for real outbound HTTP execution:

- `inspectNetwork(request)` → calls `POST /inspect/network`
- `evaluatePolicy(context)` → calls `POST /evaluate`
- `runOutbound({ networkRequest, context, execute })` → runs both preflights, then executes the real action only if not blocked
- `createObservedWebFetch(config).fetch(url, init)` → wraps a real `fetch()` call with the preflight sequence (observe mode by default)

Rollout behavior:

- default `rolloutMode: "observe"` (simulation/logging first, no broad blocking)
- optional `rolloutMode: "enforce_critical"` for narrowly scoped critical deny enforcement
- explicit **fail-open** handling if Agentwall is unavailable or times out, so outbound execution does not break by default

Validation harness:

- `tests/openclaw-preflight.integration.test.ts` exercises observe-mode pass-through, fail-open behavior when Agentwall is down, and critical-only enforcement behavior.
- `tests/openclaw-observed-web-fetch.integration.test.ts` validates side-by-side wiring with an actual outbound HTTP server target, verifies telemetry events, and verifies fail-open pass-through when Agentwall is unreachable.

## Runtime integration status

The adapter contracts and integration tests in this repository are ready for staged rollout.
Production runtime wiring should be implemented in upstream OpenClaw source integrations (not package-dist patches) before broad deployment.
