# Agentwall Public Release Strategy (v1)

## Goal
Launch a public repo that maximizes trust, adoption, and technical credibility **without publishing the full business moat on day one**.

## Release posture: “Open Control Plane Core”

### Public now (for trust + stars)
- Policy engine, evaluators, and API surface (`/evaluate`, `/inspect/*`, `/detections`).
- Approval workflow primitives and persistence adapters.
- Dashboard/runtime evidence model (enough to prove real operation).
- OpenClaw monitor-first integration examples.
- Test suite for core safety claims (SSRF, default-deny egress, DLP, policy runtime).
- Docs that make adoption easy in <30 minutes.

### Keep private (initial moat)
- Proprietary detection packs and continuously updated threat intel mappings.
- Enterprise policy bundles/playbooks by vertical (fintech/healthcare/support ops).
- Hosted control-plane workflows (managed approvals, org analytics, multi-tenant governance).
- Advanced incident automation and response orchestration.
- Commercial connectors requiring ongoing maintenance SLAs.

## Product framing
- Position Agentwall as the **runtime safety layer** for existing agent stacks.
- Avoid framing as “just regex DLP” or “just prompt guardrails.”
- Repeat this wedge: **“Control actions, not prompts.”**

## Anti-clone strategy (practical)
1. **Open source the engine; commercialize operations.**
2. Invest moat into:
   - curated policy intelligence,
   - deployment expertise,
   - managed service reliability,
   - compliance evidence workflows.
3. Publish a public roadmap with clear open/community lane vs commercial lane.

## Recommended repo boundaries
- Keep this repository as the OSS core (`agentwall`).
- Create a private sibling repo for:
  - enterprise detectors,
  - customer-specific integrations,
  - managed control-plane backend.
- Mirror interfaces in OSS so private modules can plug in cleanly.

## 30-day post-launch plan
- Week 1: launch README, examples, screenshots, quickstart video/GIF.
- Week 2: publish “integration recipes” (OpenAI SDK wrapper, browser tooling wrapper, queue worker wrapper).
- Week 3: add benchmark + incident replay examples.
- Week 4: publish “Agentwall Enterprise Preview” page (waitlist + design partner CTA).

## Success metrics (public)
- Time-to-first-policy-decision under 15 minutes.
- Number of external adopters running `monitor` mode in production-like environments.
- Stars/forks are secondary to “active installations + PR quality.”

## Licensing recommendation
- **MIT for core** (current repo stance) to maximize adoption and integrations.
- Keep brand/trademark policy explicit (name/logo usage rules) to reduce clone confusion.
- Commercial terms for hosted/private offerings in separate contracts.
