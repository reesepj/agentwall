# Agentwall SOC/NOC Pivot Plan

Date: 2026-04-02
Owner: Reese + Hermes

## Decision

Use Agentwall as the SOC/NOC runtime control plane.
Keep the product wedge: action-time control, approvals, containment, and evidence.

Do not pivot into a generic SIEM replacement.

## What already exists (from current docs + code)

From `README.md`, `docs/architecture.md`, `docs/mvp.md`, `docs/runtime-floodguard.md`, and `docs/openclaw-first-integration-plan.md`:

- Inline `POST /evaluate` action decisions across six planes (network/tool/content/browser/identity/governance)
- Default-deny egress + SSRF/private-range controls
- Approval gate with persistent queue and dashboard/CLI controls
- FloodGuard anti-flood envelope (rate/queue/cost pressure)
- Session controls (pause/resume/terminate, shield mode, per-session overrides)
- Structured audit events and detection metadata mapped to ATT&CK where useful
- Monitor-first integration contract already documented and tested for OpenClaw/Hermes-style traffic

This is already a blue-team control surface.

## SOC mapping (Blue Team)

### Current Agentwall feature -> SOC/NOC function

1. `/evaluate` policy decision -> inline prevention and containment trigger
2. Approval queue -> analyst workflow and escalation gate
3. FloodGuard pressure + queue health -> SOC overload/abuse resilience
4. Session controls -> host/session containment actions
5. Detection timeline + audit feed -> incident timeline and evidence chain
6. ATT&CK-tagged detections -> coverage reporting and gap mapping

## Red Team lane (safe, controlled)

Use red team as validation for blue controls, not unrestricted offensive operations.

### Build lane

1. Start from existing Incident Simulation mode and adversarial backlog (`docs/research-backlog.md`)
2. Add ATT&CK-grounded scenario packs:
   - prompt injection -> tool misuse
   - egress abuse -> C2-like traffic
   - secret access -> exfil attempt
3. Run scenarios only in owned lab scope
4. Automatically score:
   - detected vs missed
   - time to detection
   - time to containment
   - false positives introduced

## 30-day implementation sequence

### Week 1: SOC baseline from existing stack

- Stand up one live dashboard stream as the default SOC console
- Normalize event classes: `alert`, `approval`, `containment`, `floodguard`, `policy-drift`
- Add SOC summary card: MTTD, MTTR, pending critical approvals, active containment sessions

### Week 2: Incident workflow hardening

- Add incident case record from existing audit + timeline events
- Add one-click runbook actions from case view:
  - set `approval-mode always`
  - enter `shield` for N minutes
  - pause/terminate selected session
- Add operator note requirements for all containment decisions

### Week 3: Red-team emulator v1

- Convert simulation into reusable scenario runner
- Add at least 5 ATT&CK-style scenarios
- Add auto post-run gap report (rule/rationale suggestions)

### Week 4: Coverage + readiness gate

- Add ATT&CK coverage board per scenario class
- Define go/no-go gate:
  - detection rate target met
  - containment SLA met
  - false positive ceiling met
- Freeze baseline and publish internal SOC/NOC runbook

## Concrete repo touchpoints

- `src/routes/dashboard.ts` (SOC summary + case/timeline state)
- `src/dashboard/state.ts` (derived SOC metrics)
- `public/app.js` + `public/index.html` (SOC/NOC operator surfaces)
- `src/runtime/floodguard.ts` (incident pressure controls)
- `src/approval/gate.ts` + `src/routes/approval.ts` (analyst queue flow)
- `tests/dashboard.test.ts`, `tests/floodguard.test.ts` (SOC workflow regressions)
- `docs/runtime-floodguard.md`, `docs/roadmap.md` (update narrative)

## Guardrails

- Lab-only for red-team execution until explicit legal scope exists
- Keep fail-open monitor-first insertion for new integrations
- Enforce only universal bad cases early; expand after signal quality is proven

## Success criteria

1. Operators can answer in <30 seconds:
   - what is happening now
   - what needs action first
   - what containment is active
2. At least one full detect->approve/deny->contain->audit loop runs daily in test or live traffic
3. Red-team scenario runs produce actionable detection-gap output every week

## Canonical references used

- `README.md`
- `docs/architecture.md`
- `docs/mvp.md`
- `docs/roadmap.md`
- `docs/runtime-floodguard.md`
- `docs/threat-model.md`
- `docs/openclaw-first-integration-plan.md`
- `docs/openclaw-live-handoff-2026-03-29.md`
- `docs/hermes-monitor-first-integration-2026-03-29.md`
- `docs/research-backlog.md`
- `docs/threat-intel-sources.md`
