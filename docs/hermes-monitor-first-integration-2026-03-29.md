# Hermes ↔ Agentwall monitor-first integration

Date: 2026-03-29
Owner: Hermes

## Goal

Exercise Agentwall with real Hermes traffic now without causing production damage.

## Rollout rule

Fail open first.
Observe first.
Do not block Hermes production traffic until mirror quality is trustworthy.

---

## Safe first shape

### Agentwall runtime
Use the already-running live Agentwall instance:
- `http://127.0.0.1:3015`

### Hermes integration mode
Start with mirror-only calls from Hermes tool execution paths.
That means:
- Hermes still performs the original action path
- Hermes sends preflight/evaluation events to Agentwall in parallel or immediately before action
- if Agentwall is down or times out, Hermes continues normally
- no production mutation path changes on day one

---

## Best first Hermes insertion points

### 1) Web tools
Mirror these into Agentwall first:
- `web_search`
- `web_extract`
- browser navigations to new origins

Use:
- `/inspect/network` for raw target checks
- `/evaluate` with `plane: network` for policy context

### 2) Terminal tool
Mirror high-risk commands into `/evaluate` with:
- `plane: tool`
- `action: bash_exec` or `terminal_exec`
- command string in payload

At first:
- log only
- no hard blocks
- compare Agentwall output to Hermes' own approval system

### 3) Browser tool
Mirror only the highest-risk browser events first:
- navigation to unfamiliar origin
- form submit
- uploads
- auth / oauth completion

### 4) File / identity access later
After signal quality is good:
- secret/env access
- credential reads
- destructive file operations

---

## Hermes event mapping

### Network example
```json
{
  "agentId": "hermes",
  "sessionId": "<hermes-session-id>",
  "plane": "network",
  "action": "http_request",
  "payload": {
    "url": "https://api.openai.com/v1/chat/completions",
    "tool": "web_extract"
  },
  "actor": {
    "channelId": "telegram:NYX:134",
    "userId": "reese",
    "roleIds": ["owner"]
  },
  "control": {
    "executionMode": "normal",
    "enforcedBy": "hermes"
  },
  "provenance": [
    {"source": "user", "trustLabel": "trusted"}
  ],
  "flow": {
    "direction": "egress",
    "labels": ["external_egress"],
    "highRisk": true
  }
}
```

### Tool example
```json
{
  "agentId": "hermes",
  "sessionId": "<hermes-session-id>",
  "plane": "tool",
  "action": "bash_exec",
  "payload": {
    "command": "git status"
  },
  "actor": {
    "channelId": "telegram:NYX:134",
    "userId": "reese",
    "roleIds": ["owner"]
  },
  "control": {
    "executionMode": "normal",
    "enforcedBy": "hermes"
  },
  "provenance": [
    {"source": "user", "trustLabel": "trusted"}
  ],
  "flow": {
    "direction": "internal",
    "labels": ["destructive_action"],
    "highRisk": true
  }
}
```

---

## Real-use test standard

This is the right way to test without breaking production:

1. Hermes keeps acting normally
2. Agentwall receives mirrored real traffic
3. dashboard collects live evidence
4. compare Agentwall judgments with Hermes native approvals and operator intuition
5. only then turn on limited enforcement for clearly universal bad cases

Universal bad cases worth enforcing earlier:
- metadata endpoint access
- private/loopback SSRF
- clearly destructive shell actions without approval

Everything else starts in observe mode.

---

## Minimal implementation path inside Hermes

### Phase A
- add tiny Agentwall client helper
- env/config:
  - `AGENTWALL_URL=http://127.0.0.1:3015`
  - `AGENTWALL_MODE=observe`
  - `AGENTWALL_TIMEOUT_MS=250`
- fail open on any request error
- emit lightweight logs only

### Phase B
- instrument `web_tools.py`
- instrument `terminal_tool.py`
- record Agentwall request/response summaries in Hermes logs or trajectory metadata

### Phase C
- add optional dashboard trace links or audit IDs
- compare false positives for a few days of real usage

### Phase D
- enable narrow enforcement only for universal critical cases

---

## Current blocker

I do not have the live Hermes repo mounted in the local project paths I checked, so I have not patched Hermes code yet.

That means the safe move today is:
- keep Agentwall live
- finalize the monitor-first integration contract
- patch Hermes once the local repo path is available

## Current proof

Agentwall is already live and responding on `127.0.0.1:3015`.
OpenClaw-style smoke events already pass through it successfully.
That makes Hermes the next clean integration target.
