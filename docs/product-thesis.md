# Agentwall Product Thesis (Locked)

## One-sentence thesis
Agentwall is the runtime defense layer for agentic AI: it sits between autonomous agents and real-world action surfaces, enforcing security policy at execution time with default-deny controls, human approval gates, and forensic-grade decision evidence.

## The problem we are actually solving
Teams can stand up agents quickly, but once those agents touch network egress, tools, browser sessions, secrets, and governance operations, the risk profile looks like an always-on insider with automation speed.

Existing controls are fragmented:
- Prompt-level guardrails are not execution controls.
- API gateways do not understand agent provenance or trust boundaries.
- SIEM/TIP stacks are post-hoc, not inline policy enforcement.

## Product position
Agentwall is **not** an agent framework and **not** a replacement for model safety. It is a dedicated runtime control plane focused on high-risk action mediation.

Think:
- **Cloudflare/WAF for agent actions**
- **PAM-style approvals for AI-initiated privileged behavior**
- **Security evidence stream built from every decision**

## Ideal customer profile (MVP)
Security-conscious engineering teams shipping internal or customer-facing AI agents that can:
- make outbound HTTP requests,
- execute tools or shell-like actions,
- interact with browsers,
- access secrets/identity systems,
- and perform governance/config actions.

Primary buyer: security/platform lead.
Primary daily user: operator/SRE/on-call responder.

## Why this wins
- Works with existing agent stacks (no re-platform requirement)
- Enforces action-time controls, not just intent-time filters
- Produces structured evidence for incident response and compliance
- Gives a practical “safe autonomy” middle path: allow, deny, redact, approve
