# Agentwall MVP Definition (Buildable v0.1)

## MVP goal
Deliver a production-usable runtime defense service that can be inserted in front of an existing agent runtime and deterministically decide whether an action is allowed, denied, redacted, or requires approval.

## Who MVP serves
- Teams already running agents in staging/production
- Need immediate risk reduction without rewriting orchestration stack
- Need explainable, auditable control decisions

## What MVP is
A standalone HTTP policy service with:
1. **Synchronous action evaluation** (`/evaluate`) across six planes:
   - network, tool, content, browser, identity, governance
2. **Default-deny egress posture** with SSRF/private-range protections
3. **Provenance + trust + flow-aware decisions** (source and boundary context)
4. **Approval gating** with persistent pending queue
5. **Structured audit trail** for each policy decision
6. **Policy runtime reload** from YAML/JSON declarative rules
7. **Operator dashboard APIs** for state, session control, and drilldowns
8. **Detection metadata mapping** (including MITRE ATT&CK where stable)

## What MVP explicitly excludes
- Full transparent network proxy mode (CONNECT/TLS MITM)
- External threat intel lookups in the hot decision path
- Complex UEBA/anomaly modeling
- Multi-tenant RBAC control plane
- A full SIEM/TIP replacement

## MVP API surface
- `POST /evaluate`
- `GET /rules`
- `GET /detections`
- `POST /inspect/network`
- `POST /inspect/content`
- approval + dashboard control APIs

## MVP success criteria
- Block known critical egress abuse paths by default
- Route risky actions to approval deterministically
- Return machine-parseable reasons and matched rules
- Emit decision evidence suitable for incident timelines
- Survive policy updates without restart and without dropping last-known-good rules

## Current implementation status
- Core enforcement and audit path: implemented
- Detection catalog + ATT&CK annotations for high-value detections: implemented
- Runtime policy hot reload: implemented
- External enrichment + deep analytics: deferred to post-MVP
