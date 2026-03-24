# Agentwall Product Portfolio

**Version:** 2026-03-23  
**Positioning:** Runtime control plane and enforcement layer for autonomous agents

## 1) Thesis

Agentwall is the runtime control plane between AI agent intent and real-world action.

It enforces policy **at execution time** across network egress, tools, browser actions, content flow, secrets, and governance operations—with structured evidence for every decision.

## 2) The Problem

Teams can ship agents fast, but risk compounds once those agents can:

- call external APIs
- run tools/shell-like actions
- interact with browsers
- access sensitive data or credentials
- perform privileged governance changes

Prompt safety and static filters are not enough for runtime behavior. Agentwall closes that gap with action-time controls.

## 3) Product Surfaces (Current)

### A. Security Console (Operator UI)
- Real-time posture overview
- Approval/session controls
- Priority queue and risk signals
- Policy execution mix and hotspots
- Audit feed, inspection activity, evidence/task graph

### B. Policy & Inspection API
- `/evaluate` for policy decisions
- `/inspect/network` for preflight egress checks
- `/api/dashboard/state` for console state
- `/api/dashboard/drilldown/:kind/:id` for investigation detail

### C. Control Runtime
- Approval gate with persisted queue
- Manifest integrity checks
- Watchdog heartbeat states (`healthy`, `stale`, `expired`, `disabled`)
- Degraded execution modes (`normal`, `read_only`, `answer_only`)

## 4) Core Capabilities

- Provenance + trust-aware policy inputs (`source`, `trustLabel`)
- Flow-aware risk metadata and boundary crossing signals
- Default-deny egress posture with SSRF/private-range protection
- DLP scanning and optional redaction pipeline
- Human-in-the-loop approvals for risky actions
- Structured audit events for incident response/compliance
- Actor-scoped policy (channel/user/role)

## 5) Installation + CLI Story

```bash
git clone https://github.com/your-org/agentwall
cd agentwall
npm install
npm run onboard
npm run build
npm start
```

Primary workflows:
- `npm run onboard` → generates config and policy scaffold
- `npm start` → starts service (default `127.0.0.1:3000`)
- `npm test` → policy/runtime/integration coverage

Operational note:
- If `policy.configPath` points to `./policy.yaml`, that file must exist before startup.

## 6) Rollout Model (Recommended)

### Phase 0 — Observe
- Mirror high-risk actions into Agentwall
- Enable logging/audit only
- Keep fail-open behavior for initial insertion points

### Phase 1 — Enforce Critical
- Block clearly dangerous egress (metadata endpoints, private ranges)
- Route medium/high-risk decisions to approvals

### Phase 2 — Expand Scope
- Enforce across tool, browser, and identity planes
- Add actor-scoped guardrails by channel/role

### Phase 3 — Production Hardening
- Drift detection + approval revalidation for manifests
- Watchdog-driven containment and degraded modes
- SIEM/SOC integration via structured events

## 7) Screenshots / Visual Assets

All captured on 2026-03-23 from local runtime `http://127.0.0.1:3000`.

1. **Console Full View**  
   `docs/assets/agentwall-console-full.png`
2. **Console Hero / Above the Fold**  
   `docs/assets/agentwall-console-hero.png`
3. **Dashboard State API Surface**  
   `docs/assets/agentwall-api-dashboard-state.png`
4. **Approval in Action (Pending Human Decision)**  
   `docs/assets/agentwall-approval-in-action.png`

Web-copy duplicates for lightweight publishing:
- `public/assets/agentwall-console-full.png`
- `public/assets/agentwall-console-hero.png`
- `public/assets/agentwall-api-dashboard-state.png`
- `public/assets/agentwall-approval-in-action.png`

## 8) Approval Story (Operator Loop Complete)

A synthetic high-risk action (`tool: secrets.read`) was submitted with:
- untrusted provenance,
- high-risk flow labels,
- and `requiresApproval: true`.

Agentwall routed it to the live approvals queue, where operators could approve/deny from the console. This demonstrates the full control loop from detection to explicit human gate.

## 9) Why Agentwall Matters

Agentwall creates a practical middle path between “fully autonomous agents” and “agents locked down so hard they can’t be useful.”

It gives teams:
- execution-time control instead of hope-based prompting,
- measurable guardrails instead of vague trust,
- and forensic-grade operational evidence instead of post-incident guesswork.

## 10) Capture Path

Screenshot capture was completed via Playwright CLI against the running local service:

```bash
npx playwright screenshot --device="Desktop Chrome" --full-page http://127.0.0.1:3000 docs/assets/agentwall-console-full.png
npx playwright screenshot --device="Desktop Chrome" http://127.0.0.1:3000 docs/assets/agentwall-console-hero.png
npx playwright screenshot --device="Desktop Chrome" http://127.0.0.1:3000/api/dashboard/state docs/assets/agentwall-api-dashboard-state.png
npx playwright screenshot --device="Desktop Chrome" --full-page http://127.0.0.1:3000 docs/assets/agentwall-approval-in-action.png
```
