# OpenClaw → Agentwall live handoff

Date: 2026-03-29
Owner: Hermes

## Current runtime reality

OpenClaw is retired on this box right now, so there is no live OpenClaw daemon/config to patch in place.
Agentwall is the live preserved runtime.

## Live Agentwall endpoint

- Local: `http://127.0.0.1:3015`
- LAN: `http://10.10.1.69:3015`
- Tailscale: `http://100.77.232.34:3015`

Current listener proof:
- process bound on `0.0.0.0:3015`
- `/health` responding
- `/api/dashboard/state` responding
- `/evaluate` responding with real policy decisions

## Verified live smoke results

### Network-style evaluate
Target: `https://api.openai.com/v1/chat/completions`
Result: `allow`
Reason: matched approved AI/research egress rule.

### Tool-style evaluate
Action: `bash_exec`
Result: `approve`
Reason: shell execution correctly routes into approval-required posture.

This proves the preserved OpenClaw-oriented policy pack is alive on the running Agentwall instance.

## First wiring target when OpenClaw returns

Use the existing monitor-first adapter in:
- `src/integrations/openclaw/preflight.ts`
- `src/integrations/openclaw/web-fetch-egress.ts`

Point it at:
- `agentwallUrl: "http://127.0.0.1:3015"`
- `rolloutMode: "observe"` first
- move to `enforce_critical` only after mirror quality looks good

## Minimal insertion points

### Outbound network preflight
Call before real outbound requests:
- `/inspect/network` for raw URL checks
- `/evaluate` with `plane: network` for full policy context

### Tool execution preflight
Mirror these first:
- `exec`
- shell-like commands
- destructive file operations
- install/update flows

### Identity preflight
Mirror:
- secret reads
- credential/vault access
- token retrieval wrappers

## Exact adapter config shape

```ts
const adapter = new OpenClawPreflightAdapter({
  agentwallUrl: "http://127.0.0.1:3015",
  rolloutMode: "observe",
  timeoutMs: 1000,
});
```

## Local smoke script

Run:

```bash
node scripts/openclaw-agentwall-smoke.js
```

Optional alternate target:

```bash
node scripts/openclaw-agentwall-smoke.js http://10.10.1.69:3015
```

The script sends:
- one OpenClaw-like `plane=tool` exec event
- one OpenClaw-like `plane=network` egress event

and prints JSON results.

## Recommendation

The next real integration move is not more Agentwall feature work.
It is rebuilding only the narrow OpenClaw monitor-first preflight seam against `http://127.0.0.1:3015`, then proving:
1. fail-open when Agentwall is unreachable
2. allow on normal approved egress
3. approval-required on shell exec
4. block on critical SSRF/private-range cases once enforcement is enabled
