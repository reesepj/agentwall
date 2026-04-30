# Organization Control Plane Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn Agentwall from a single local dashboard into an organization-wide control plane for many Agentwall instances, gateways, channels, and agents.

**Architecture:** Every Agentwall install keeps its local UI. One install can also run as the organization console by ingesting health/channel/policy summaries from peer instances and rendering them in a single pane. The normalized unit of control is still `actor.channelId` plus `agentId`, so Telegram topics, Slack channels, Discord channels, web gateways, API gateways, and future agent runtimes all look the same to policy.

**Tech Stack:** TypeScript, Fastify, existing Agentwall dashboard API, file-backed declarative policies, existing `/evaluate` request envelope.

---

## Product shape

Agentwall has two deployment modes:

1. **Instance console**
   - Included with every download/install.
   - Shows local agents, local gateways, local channels, local approvals, local policies.

2. **Organization console**
   - Same dashboard codebase, with organization config enabled.
   - Shows many Agentwall instances in one pane.
   - Lets operators drill from org → instance → gateway → agent → channel → guardrail.
   - Saves scoped guardrails back to the owning instance, not to a fake central copy.

## Normalized inventory model

```txt
Organization
  Instance: nyxserver-agentwall, prod-east-agentwall, soc-lab-agentwall
    Gateway: slack, telegram, discord, web, api, mcp, custom
      Channel: slack:T123:C456, telegram:-100:1199, api:prod:billing-agent
        Agent: support-agent, soc-agent, finance-agent, coding-agent
          Guardrails: scoped policy rules matching actor.channelId + subject.agentId/sessionId
```

## Control rules

- Every gateway adapter must emit `actor.channelId`.
- Every agent runtime must emit `agentId`.
- Every policy save must be scoped to a real owning instance.
- Organization console can display global state, but enforcement stays inline at the instance/gateway where the agent action happens.
- No platform-specific logic in core policy. Slack, Telegram, Discord, API, browser, and MCP are just gateway/channel identity providers.

---

### Task 1: Add organization inventory data model

**Objective:** Create a generic single-pane model independent of Pi, Telegram, or any one agent framework.

**Files:**
- Create: `src/org/control-plane.ts`
- Test: `tests/org-control-plane.test.ts`

**Implementation notes:**
- Add `AgentwallFleetInstance`, `AgentGateway`, `OrgChannel`, `OrgAgentLane`, `OrganizationControlPlaneSnapshot`.
- Add `inferGatewayKind(channelId)` for normalized prefixes.
- Add `buildOrganizationControlPlaneSnapshot(...)` to group observed channels into gateways and agent lanes.

**Verification:**

```bash
npm test -- --runInBand tests/org-control-plane.test.ts
```

### Task 2: Expose org control plane on dashboard state

**Objective:** Make every dashboard API response include the local organization-control snapshot.

**Files:**
- Modify: `src/config.ts`
- Modify: `src/dashboard/state.ts`
- Test: `tests/dashboard.test.ts`

**Implementation notes:**
- Add optional `organization` config block: `instanceId`, `instanceName`, `environment`, `region`, `instances`.
- In `RuntimeState.getSnapshot(...)`, derive `organizationControlPlane` from local config plus `channelInventory`.
- Include it in `/api/dashboard/state`.

**Verification:**

```bash
npm test -- --runInBand tests/org-control-plane.test.ts tests/dashboard.test.ts
npm run build
```

### Task 3: Add organization panel to UI

**Objective:** Render the single-pane view without replacing the existing local instance console.

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: `tests/dashboard.test.ts`

**UI sections:**
- `Organization Control Plane`
- `Instances`
- `Gateways`
- `Agents`
- `Channels`
- `Control channel`

**Verification:**

```bash
npm test -- --runInBand tests/dashboard.test.ts
npm run build
```

### Task 4: Add peer instance registry

**Objective:** Let the organization console know about other Agentwall instances before live federation exists.

**Files:**
- Modify: `examples/config.yaml`
- Modify: `docs/install.md`
- Modify: `src/config.ts`
- Test: `tests/org-control-plane.test.ts`

**Config shape:**

```yaml
organization:
  instanceId: "prod-east-agentwall"
  instanceName: "Prod East Agentwall"
  environment: "prod"
  region: "us-east"
  instances:
    - id: "soc-console"
      name: "SOC Console"
      url: "https://agentwall-soc.example.com"
      role: "remote"
      status: "unknown"
```

### Task 5: Add federation ingestion later

**Objective:** Pull summaries from remote Agentwall instances safely.

**Rules:**
- Start with read-only federation.
- Pull only compact summaries, not raw prompts, secrets, or full payloads.
- Require signed instance tokens before write controls.
- Writes must target the owning instance API and include audit evidence.

**Future endpoints:**

```txt
GET /api/org/summary
POST /api/org/register-instance
POST /api/org/instance/:id/policy-scoped-rule
```

## Done means

- A fresh Agentwall install still has its local dashboard.
- A configured org console shows multiple instances in one pane.
- Channels from Slack/Telegram/Discord/API/browser all normalize into the same model.
- Operators can control channel guardrails without caring which agent framework produced the request.
- Enforcement remains inline and local to the gateway/instance where the action happens.
