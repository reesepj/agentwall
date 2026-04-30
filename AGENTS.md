# Agentwall Project Context

Goal
- treat Agentwall as a local dashboard plus organization control-plane product for all agentic AI
- prioritize practical operator value over abstract architecture churn
- keep the product generic: instance → gateway → channel → agent → action → policy

Source of truth
- live config: `/home/reese/projects/agentwall/state/agentwall-live.config.yaml`
- runtime status endpoint: `http://127.0.0.1:3015/api/dashboard/state`
- org federation summary endpoint: `http://127.0.0.1:3015/api/org/summary`

Current truth
- local Agentwall service runs on `127.0.0.1:3015`
- control-plane status is the source of truth, not whether repo-root starter files exist
- remote Agentwall federation is being built in small read-only → authenticated ingest → delegated control phases

Working rules
- JSOC split here is strict: Hermes orchestrates/finalizes, Codex implements, Janus gates meaningful changes, and Athena reviews Agentwall product/security after each build phase
- use subagents as temporary bounded workers only; do not let them self-finalize
- prefer existing Agentwall CLI and dashboard routes over ad hoc scripts
- validate against live dashboard/org state when possible
- preserve `defaultDeny` egress posture and watchdog intent
- prefer the live config in `state/agentwall-live.config.yaml` for local runtime work
- Pi Agent is an optional external harness, not the Agentwall product center

What done means
- local Agentwall operator path works
- dashboard/control-plane checks are real
- Athena review has passed or open findings are named
- next actions are concrete: hardening, federation, verification, or controlled delegation
