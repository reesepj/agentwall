# Agentwall

<img width="800" height="300" alt="logo_full" src="https://github.com/user-attachments/assets/53c73a39-cff2-4c75-a5b9-fab14485287d" />


> **The runtime control plane for AI agents.**  
> Stop risky actions at execution time — before an agent can send, fetch, click, run, or exfiltrate.

Agentwall is a **provenance-aware enforcement layer** that sits between autonomous agents and real-world action surfaces (network, tools, browser, content, identity, governance). It evaluates each action against policy and emits structured evidence for every allow, deny, redact, or approval decision.

## Why Agentwall

Most teams can ship an agent demo quickly. Risk shows up when that agent can actually do things.

Agentwall gives you execution-time control where risk becomes real:

- **Control actions, not just prompts**
- **Default-deny egress and policy enforcement by default**
- **Human approvals for high-risk moves**
- **Provenance + trust labels on decision inputs**
- **Operator-grade auditability and incident evidence**

## Approval in action (portfolio-complete)

A real approval request was injected into runtime (`tool: secrets.read`, high risk, untrusted provenance) with manual review required. The console captured the pending request in the live approvals queue before resolution timeout.

This closes the end-to-end operator story: **detect → route to approval → operator decision → audited outcome**.

## What Agentwall currently ships

| Capability | Status |
|---|---|
| Policy evaluation API (`/evaluate`) | ✓ |
| Provenance + trust-aware decisions | ✓ |
| SSRF / private-range blocking | ✓ |
| Default-deny egress allowlisting | ✓ |
| DLP scanning (secrets + PII) | ✓ |
| Human approval gate | ✓ |
| Persistent approval queue | ✓ |
| Dashboard + drilldowns | ✓ |
| Manifest drift detection helpers | ✓ |
| Watchdog heartbeat skeleton | ✓ |
| Structured audit log | ✓ |
| Actor-scoped policy (channel/user/role) | ✓ |
| Degraded execution modes (`normal`, `read_only`, `answer_only`) | ✓ |

## Quickstart

```bash
git clone https://github.com/<your-org-or-user>/agentwall.git
cd agentwall
npm install
npm run build
node dist/cli.js init --mode guarded --allow-hosts api.openai.com
node dist/cli.js doctor
node dist/cli.js start
```

Default address: `http://127.0.0.1:3000`

Run tests:

```bash
npm test
```

## CLI

```bash
agentwall init [--mode monitor|guarded|strict] [--allow-hosts a,b,c] [--lan] [--force]
agentwall start
agentwall dev
agentwall doctor
agentwall version
agentwall help
```

## Production-ready baseline in this repo

This repository includes a practical OSS launch baseline:

- CI workflow for lint/build/test/audit (`.github/workflows/ci.yml`)
- Security + contribution community files (`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`)
- Issue + PR templates (`.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`)
- Architecture, threat model, and release strategy docs in `docs/`
- Portfolio/demo page at `public/portfolio.html`

## Runtime model (core)

Every evaluated action is an `AgentContext` with:

- `plane`: network, tool, content, browser, identity, governance
- `actor`: optional `channelId`, `userId`, `roleIds`
- `control`: optional execution mode (`normal`, `read_only`, `answer_only`)
- `provenance`: source/trust descriptors (`user`, `web`, `tool_output`, etc.)
- `flow`: ingress/internal/egress metadata + high-risk flags
- `payload`: action details

Policy output includes decision + risk + `highRiskFlow` metadata.

## API examples

Evaluate an action:

```bash
curl -X POST http://localhost:3000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "plane": "network",
    "action": "http_request",
    "payload": { "url": "https://api.openai.com/v1/chat/completions" },
    "actor": { "channelId": "telegram:direct:<user-id>", "userId": "<user-id>", "roleIds": ["owner"] },
    "control": { "executionMode": "normal" },
    "provenance": [{ "source": "web", "trustLabel": "untrusted" }],
    "flow": {
      "direction": "egress",
      "labels": ["external_egress"],
      "highRisk": true,
      "crossesBoundary": true
    }
  }'
```

Inspect content:

```bash
curl -X POST http://localhost:3000/inspect/content \
  -H "Content-Type: application/json" \
  -d '{ "text": "Contact alice@example.com", "source": "email" }'
```

List detections:

```bash
curl http://localhost:3000/detections
```

## Default security posture

```yaml
policy:
  defaultDecision: "deny"
egress:
  enabled: true
  defaultDeny: true
  allowPrivateRanges: false
  allowedSchemes: ["https"]
  allowedPorts: [443]
```

Approvals are persisted by default in `./agentwall-approvals.json`.

## OpenClaw monitor-first integration

For OpenClaw rollout, begin with monitor-first sidecar insertion:

- `docs/openclaw-first-integration-plan.md`
- `examples/openclaw-monitor-first.config.yaml`
- `examples/openclaw-monitor-first.policy.yaml`

The repo includes `src/integrations/openclaw/preflight.ts` for fail-safe preflight adapters.

## Product + launch docs

- `docs/agentwall-portfolio.md` — launch narrative and asset index
- `public/portfolio.html` — deck-style portfolio page (`/portfolio`)
- `docs/product-thesis.md`
- `docs/mvp.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/agentwall-product-copy.md`
- `docs/community-issues-seed.md` — first three community issues ready to post

## Open-source boundary (important)

Agentwall OSS is the runtime control-plane core.

- Public repo scope: policy engine, enforcement APIs, dashboard, integrations, and tests
- Commercial/private scope: managed service operations, proprietary policy intelligence packs, enterprise connectors, and incident automation workflows

See: `docs/public-release-strategy.md` and `docs/launch-readiness-checklist.md`.

## Visual asset index

Approved launch screenshots:

- `docs/assets/agentwall-console-full.png`
- `docs/assets/agentwall-console-hero.png`
- `docs/assets/agentwall-approval-in-action.png`

Publishing copies:

- `public/assets/agentwall-console-full.png`
- `public/assets/agentwall-console-hero.png`
- `public/assets/agentwall-approval-in-action.png`

## License

MIT

## Release notes

- `CHANGELOG.md` tracks public release deltas (`v0.1.0` included).
- `docs/launch-readiness-checklist.md` contains the final pre-public checklist.
