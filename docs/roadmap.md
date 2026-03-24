# Agentwall Roadmap

## Delivery principle
Ship the minimum runtime-defense surface that materially lowers agent risk, then deepen based on real operator usage.

## v0.1 (Current MVP)
- [x] Synchronous policy evaluation API
- [x] Default-deny egress and SSRF/private-range blocking
- [x] Six-plane policy model (network/tool/content/browser/identity/governance)
- [x] Provenance, trust-label, and flow-aware decisions
- [x] Approval gate with file-backed pending queue
- [x] Structured audit event emission
- [x] Declarative policy loading + hot reload with last-known-good behavior
- [x] Dashboard state + drilldown + session control APIs
- [x] Detection metadata catalog endpoint (`/detections`) with ATT&CK annotations for key detections

## v0.2 (Operational hardening)
- [ ] Signed/tamper-evident audit events
- [ ] Webhook or chat notifications for pending approvals
- [ ] Per-agent/session policy overlays
- [ ] Dashboard/operator UX for detection timeline views

## v0.3 (Integration acceleration)
- [ ] Thin SDK wrappers (TS/Python) for preflight evaluate hooks
- [ ] OpenTelemetry export for decision traces
- [ ] Policy simulation mode (what would happen under new rule set)

## v0.4+ (Expansion, not MVP blockers)
- [ ] Proxy mode for lower-friction insertion
- [ ] Async enrichment pipeline (domain/file reputation) outside inline decision path
- [ ] Multi-tenant policy namespaces + RBAC

## Non-goals
- Not a general API gateway replacement
- Not a prompt-only safety product
- Not a SIEM/TIP replacement
