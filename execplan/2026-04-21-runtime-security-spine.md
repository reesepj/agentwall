# Agentwall runtime security spine

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

Agentwall already evaluates actions, blocks dangerous egress, routes risky work to approvals, and shows operators what happened. After this plan lands, Agentwall will stop being only a decision service and become a stronger execution-time security spine for agent systems. The first visible outcome is tamper-evident audit evidence: every `/evaluate` decision will include a cryptographic chain record that the dashboard and API can surface, making it obvious when an event belongs to a verified audit history. The later milestones in this plan extend that same spine into capability-scoped execution tickets, trusted tool and MCP onboarding, and recurring agent-security regression drills.

A user should be able to start the server, send a policy evaluation, and see an audit record that includes chain metadata proving where it sits in the evidence ledger. They should also be able to run focused tests that fail before the chain exists and pass after it is wired through the runtime, dashboard, and docs.

## Progress

- [x] (2026-04-21 09:21 +08) Confirmed the active repo is `/home/reese/projects/agentwall`, refreshed `.agent.lock`, and confirmed Codex is installed locally.
- [x] (2026-04-21 09:21 +08) Verified the current baseline by running `npm test -- --runInBand tests/approval-webhook.test.ts tests/floodguard.test.ts tests/cli.test.ts tests/dashboard.test.ts` from the repo root; all 52 tests passed.
- [x] (2026-04-21 09:21 +08) Selected Codex as the primary implementation subagent for code changes and Hermes as the orchestration and review lane.
- [x] (2026-04-21 09:21 +08) Wrote this ExecPlan with tonight’s execution order and bounded first milestone.
- [x] (2026-04-21 09:27 +08) Delegated Milestone 1 to Codex with a hard file scope limited to audit typing, audit chaining, runtime preservation, and focused tests.
- [x] (2026-04-21 09:30 +08) Milestone 1 landed: `/evaluate` audit events now carry tamper-evident chain metadata, `tests/audit-chain.test.ts` was added, and `tests/dashboard.test.ts` now proves the dashboard audit feed exposes integrity metadata.
- [x] (2026-04-21 09:30 +08) Verified Milestone 1 locally with `npm test -- --runInBand tests/audit-chain.test.ts tests/dashboard.test.ts` followed by `npm run build`.
- [x] (2026-04-21 09:33 +08) Tightened Milestone 2 in this plan to a narrow route-level ticket issuance cut: issue only for executable `allow` decisions that do not require human approval.
- [x] (2026-04-21 09:37 +08) Delegated Milestone 2 to Codex with a hard scope limited to ticket typing, issuance, verification, and focused tests.
- [x] (2026-04-21 09:38 +08) Milestone 2 landed: `/evaluate` now returns a signed short-lived `capabilityTicket` for executable allow decisions, and `tests/capability-ticket.test.ts` proves allowed, denied, and approval-required behavior.
- [x] (2026-04-21 09:38 +08) Verified Milestone 2 locally with `npm test -- --runInBand tests/capability-ticket.test.ts tests/policy-runtime.test.ts tests/audit-chain.test.ts` followed by `npm run build`.
- [x] (2026-04-21 09:41 +08) Reordered the next slice: tackled the nightly security regression harness before manifest attestation because it is the highest-leverage bounded operator win for tonight.
- [x] (2026-04-21 09:43 +08) Milestone 4 landed early: `npm run test:security-regression` now drives the curated security suites and ends with build verification.
- [x] (2026-04-21 09:43 +08) Verified the new nightly security regression harness locally end to end.
- [x] (2026-04-21 10:04 +08) Milestone 3 landed: `/inspect/manifest` now returns attested trust-state assessment and records operator-visible runtime evidence for manifest inspections.
- [x] (2026-04-21 10:04 +08) Verified Milestone 3 locally with `npm test -- --runInBand tests/manifest.test.ts tests/manifest-inspection.test.ts` followed by `npm run build`.
- [x] (2026-04-21 10:04 +08) Final verification passed: `npm run test:security-regression`, `npm test -- --runInBand`, and `npm run build` all completed successfully.

## Surprises & Discoveries

- Observation: the repo is already mid-flight and the working tree is dirty in many core files, including `src/server.ts`, `src/routes/dashboard.ts`, and `tests/dashboard.test.ts`.
  Evidence: `git status --short` shows both modified and untracked files across runtime, dashboard, docs, and tests.
- Observation: the existing `.agent.lock` was stale and pointed to the old Harbor path, not the current Agentwall repo.
  Evidence: the file contained `/home/reese/.openclaw/workspace/harbor` with an expired March timestamp.
- Observation: the current safety-focused baseline is healthy enough to build on immediately.
  Evidence: `npm test -- --runInBand tests/approval-webhook.test.ts tests/floodguard.test.ts tests/cli.test.ts tests/dashboard.test.ts` passed with 4 suites and 52 tests.
- Observation: `auditFeed` in dashboard state already carries raw audit events, so preserving integrity metadata there required only a minimal assertion update rather than a feed redesign.
  Evidence: after Milestone 1, `tests/dashboard.test.ts` passes by checking `state.auditFeed.some(item => item.integrity...)` without any UI-facing schema rewrite.
- Observation: a deterministic test needed an explicit audit-chain reset hook because the logger keeps process-local chain state.
  Evidence: `tests/audit-chain.test.ts` uses `resetAuditChain()` in `beforeEach` and `afterEach`; without that reset the chain indexes would drift across server instances in the same Jest process.
- Observation: `src/integrations/openclaw/preflight.ts` tolerated the new `capabilityTicket` response field without any code change.
  Evidence: `npm test -- --runInBand tests/capability-ticket.test.ts tests/policy-runtime.test.ts tests/audit-chain.test.ts` and `npm run build` both passed with `src/integrations/openclaw/preflight.ts` untouched.
- Observation: the current ruleset contains at least one executable non-deny tool action that does not require approval, namely `tool/write_file`, which made a route-level ticket issuance cut possible without building a full executor first.
  Evidence: `tests/capability-ticket.test.ts` receives `decision: "allow"`, `riskLevel: "medium"`, and a signed `capabilityTicket` for a `write_file` request.
- Observation: a dedicated Node harness was enough for the nightly regression lane; no test or runtime code needed to move.
  Evidence: `npm run test:security-regression` passed after changes limited to `package.json` and `scripts/security-regression.js`.
- Observation: the full repo test suite stayed green after all four slices, despite the dirty working tree and repeated process-local integrity resets.
  Evidence: `npm test -- --runInBand` completed with `18 passed, 18 total` test suites and `106 passed, 106 total` tests, followed by a successful `npm run build`.

## Decision Log

- Decision: Codex is the primary coding lane for this task; Hermes remains the orchestrator and reviewer.
  Rationale: the repo’s own `AGENTS.md` says the JSOC split is strict and names Codex as the primary coding lane.
  Date/Author: 2026-04-21 / Hermes
- Decision: the first bounded milestone is tamper-evident audit chaining, not capability tickets.
  Rationale: audit chaining is already on the roadmap, is locally implementable tonight without redesigning the whole runtime, and strengthens the operator loop immediately by making evidence harder to fake or mutate.
  Date/Author: 2026-04-21 / Hermes
- Decision: later milestones stay in this single plan instead of being split into separate planning files tonight.
  Rationale: the user asked for one serious gameplan that can start now; keeping the sequence in one living plan reduces handoff loss and makes the nightly execution order obvious.
  Date/Author: 2026-04-21 / Hermes
- Decision: because the repo is dirty, every subagent task must be tightly scoped to named files and must avoid unrelated edits.
  Rationale: broad autonomous edits in this tree would create merge collisions and destroy signal.
  Date/Author: 2026-04-21 / Hermes
- Decision: preserve the current `/evaluate` response shape for Milestone 1 and expose integrity metadata through the emitted audit event and dashboard audit feed first.
  Rationale: the first goal is trustworthy evidence with minimal surface-area change; broadening the route response can happen later without blocking chain verification.
  Date/Author: 2026-04-21 / Hermes
- Decision: Milestone 2 should issue tickets only for `allow && !requiresApproval` instead of every non-deny result.
  Rationale: Agentwall should not mint live execution capability for actions that still need a human or for response classes whose executor semantics are not yet nailed down.
  Date/Author: 2026-04-21 / Hermes
- Decision: take the nightly security regression harness before manifest attestation.
  Rationale: one repeatable security command is a bigger immediate operator win tonight than expanding manifest trust semantics without a corresponding recurring exercise lane.
  Date/Author: 2026-04-21 / Hermes
- Decision: use `/inspect/manifest` plus runtime evidence/event recording as the first operator-visible trust surface for tool and MCP attestation.
  Rationale: that path adds real operator visibility with a narrow bounded change and avoids a larger dashboard redesign while the working tree is still noisy.
  Date/Author: 2026-04-21 / Hermes

## Outcomes & Retrospective

Milestone 1 is complete. Agentwall now emits tamper-evident audit events for `/evaluate` by chaining each event to the previous event’s digest with `sha256` and a monotonic `chainIndex`. The change stayed within the intended narrow scope: audit typing, a new audit chain helper, logger enrichment, a minimal runtime evidence update, one focused new test file, and one small dashboard assertion update.

Milestone 2 is also complete in its bounded first cut. `/evaluate` now returns a signed short-lived `capabilityTicket` for executable `allow` decisions that do not require human approval. The ticket is HMAC-signed with a process-local secret, carries subject and constraint details, and has a verifier helper that tests can call directly. Denied responses and approval-required responses do not receive a live ticket.

Milestone 4 landed early because it was the fastest way to turn the new security seams into an operator habit. Agentwall now has a single `npm run test:security-regression` command that runs the curated security suites for egress protections, integrity and stress controls, approvals and evidence, OpenClaw integrations, and then finishes with a build. That gives the project a real nightly regression lane instead of a loose collection of one-off test commands.

Milestone 3 is now complete too. Agentwall can inspect a tool or MCP manifest through `/inspect/manifest`, evaluate the current manifest against an approved fingerprint and optional signed attestation, and surface a trust state of `trusted`, `review_required`, or `untrusted`. The runtime records that inspection as evidence, flow, and event data so operators can see the result without a new dashboard surface.

The acceptance proof is real, not theoretical. Running `npm test -- --runInBand tests/audit-chain.test.ts tests/dashboard.test.ts` passes for Milestone 1, `npm test -- --runInBand tests/capability-ticket.test.ts tests/policy-runtime.test.ts tests/audit-chain.test.ts` passes for Milestone 2, `npm run test:security-regression` passes for the nightly harness, and `npm test -- --runInBand tests/manifest.test.ts tests/manifest-inspection.test.ts` passes for manifest trust inspection. The final broad pass also succeeded: `npm test -- --runInBand` reported `18 passed, 18 total` suites and `106 passed, 106 total` tests, followed by a successful `npm run build`.

The main tradeoff is that the audit chain state, ticket-signing secret, and manifest-attestation secret are all process-local and reset on restart. That is acceptable for this first runtime-security-spine cut because the immediate gain is trustworthy evidence, executable authorization envelopes, manifest trust inspection, and one-command regression verification inside a running Agentwall instance. Cross-process federation and durable key management are the obvious next hardening step, but the product now has a real security spine instead of a slide deck.

## Context and Orientation

Agentwall is a TypeScript Fastify service. The main server assembly lives in `src/server.ts`. Policy evaluation is handled by the `/evaluate` route in `src/routes/policy.ts`. That route parses an `AgentContext`, runs `PolicyEngine.evaluate`, emits an audit event through `src/audit/logger.ts`, and then hands the event to `RuntimeState.recordAuditEvent` in `src/dashboard/state.ts`. The dashboard and API surfaces are generated from `RuntimeState`; `tests/dashboard.test.ts` already verifies many operator-facing strings and response fields.

An `AuditEvent` is defined in `src/types.ts`. Right now it contains identifiers, timestamps, action metadata, matched rules, provenance, and flow context, but it does not contain any cryptographic linkage or integrity metadata. The logger in `src/audit/logger.ts` currently emits a bare event and writes it to stdout via `stdoutSink`. The runtime stores recent audits in memory for dashboard display.

A tamper-evident audit chain in this repository means a sequence where each event includes a digest derived from its own normalized payload plus the prior event’s digest. If any event in the middle is changed, later digests no longer match. This is not a distributed ledger or blockchain. It is a local chained evidence log that raises the cost of silent mutation and gives the operator a concrete chain state to inspect.

The user asked for a serious gameplan that starts tonight and explicitly asked that the right subagent gets the task. In this repo, `AGENTS.md` says Codex is the primary coding lane. That means implementation work should be delegated to a Codex-backed subagent with narrow file scope, while Hermes keeps the living plan, picks milestones, reviews the output, and runs final verification.

The current working tree is not clean. That matters. All edits in this plan must stay additive and tightly scoped. Do not rewrite unrelated dashboard or docs files just because they are nearby. Prefer a new helper module for audit chaining if that keeps the change isolated.

## Plan of Work

Milestone 1 is tonight’s first code slice. Add a tamper-evident audit chain that starts in `src/audit/logger.ts`, extends `AuditEvent` in `src/types.ts`, and becomes visible in `src/dashboard/state.ts` and any route or UI state that already exposes audit feed data. The implementation should create a small helper in `src/audit/chain.ts` that owns canonical serialization, digest creation, previous-hash linkage, and a monotonic chain index. Keep the hash algorithm simple and built-in, using Node’s `crypto` module so there is no new dependency. The first event in a process should carry a `previousHash` of `null` and a chain index of `0`; subsequent events should carry the prior digest and increment the index.

`src/audit/logger.ts` should stop being a stateless formatter and instead own a process-local chain state. The `emit` function should enrich the outgoing `AuditEvent` with an `integrity` object before sending it to sinks. The integrity object should be part of the typed event definition in `src/types.ts`. The object must contain the chain index, the digest for this event, the previous digest or `null`, the hash algorithm name, and a short status field such as `verified-local` so downstream surfaces can render intent without recomputing semantics.

`src/dashboard/state.ts` should preserve this metadata in the audit feed and evidence ledger. The operator-facing goal is not a new big feature pane tonight; it is making the existing evidence surfaces honest and inspectable. When the runtime builds recent audit feed items, it should carry enough integrity fields that later UI work can show “chain linked” or “chain head” without recomputation. If the current dashboard state already includes raw audit events, keep the change minimal: add the integrity fields to the existing objects rather than inventing a new feed.

Tests for Milestone 1 should be added before implementation. Create a new focused test file `tests/audit-chain.test.ts` if that keeps the assertions isolated. That test should prove that two successive `/evaluate` calls produce two different audit event IDs, a chain index that increments from `0` to `1`, a second event whose `previousHash` equals the first event’s `hash`, and non-empty hash values. Add one targeted assertion in `tests/dashboard.test.ts` that the dashboard state’s `auditFeed` exposes the integrity metadata for a live event. If the runtime already serializes audit feed items in a transformed shape, assert the exact field names there.

Milestone 2 builds on the chain by introducing capability-scoped execution tickets. The bounded first version should stay narrow: create a new helper in `src/runtime/capabilities.ts` that issues a short-lived, HMAC-signed ticket only when `/evaluate` returns an executable decision that does not still require human approval. In practice, that means `allow` decisions and any `approve` path that has already been auto-resolved elsewhere later can adopt the same shape, but tonight’s route-level issuance should start with `!requiresApproval` so Agentwall does not mint live capability envelopes for work that still needs a human.

The capability ticket should be added to `src/types.ts` as a stable interface and surfaced in the `/evaluate` response from `src/routes/policy.ts`. The envelope should include a ticket id, issued and expiry timestamps, the policy decision and risk level, the subject agent and session, the plane and action, any actor scope present on the request, a simple constraint block derived from the request payload and flow, and a detached signature field. Use only Node built-ins. A process-local secret initialized once per process is enough for this milestone because the acceptance goal is proving that Agentwall can issue and verify short-lived authorization envelopes, not cross-process federation yet.

Tests for Milestone 2 should be added before implementation. Create `tests/capability-ticket.test.ts` and prove three behaviors: an allowed request gets a ticket with a valid signature and future expiry; a denied request gets no ticket; and a request that still requires approval gets no active ticket. Update `src/integrations/openclaw/preflight.ts` only if the response typing needs to tolerate the new `capabilityTicket` field while keeping current behavior unchanged.

Milestone 3 adds trusted tool and MCP manifest attestation with operator-visible trust state. Keep this bounded and real. Extend `src/integrity/manifest.ts` so an approved manifest fingerprint can optionally carry a signed attestation envelope and `detectManifestDrift(...)` can return a trust state such as `trusted`, `review_required`, or `untrusted` instead of only hash drift. Use only Node built-ins. A process-local HMAC secret is acceptable for this first attestation cut, just like capability tickets, because the goal is to prove the trust contract and surface it to operators before solving cross-process key management.

Wire that trust state into a new `/inspect/manifest` route in `src/routes/inspect.ts`. The route should accept a subject id, subject type, current manifest, and optional approved fingerprint record, then return the enriched manifest assessment. `src/dashboard/state.ts` should record the inspection as evidence and push a runtime event that makes the trust state visible through existing operator feeds. The point is that an operator can inspect a tool or MCP manifest and immediately see whether Agentwall considers it trusted, drifted, or still awaiting review.

Tests for Milestone 3 should prove both the attestation helper and the route-level operator story. Extend `tests/manifest.test.ts` to cover valid attestation, missing attestation, and drifted manifest cases. Add one focused route-level test, for example `tests/manifest-inspection.test.ts`, that posts to `/inspect/manifest` and verifies both the returned trust state and the presence of a corresponding runtime event or evidence record in dashboard state.

Milestone 4 adds the regression harness. The repository already has a red-vs-blue scenario document and several focused tests. The next move is to consolidate a nightly security regression lane driven by concrete agent abuse scenarios. The likely artifacts are a new `tests/security-regression/` directory or an equivalent set of scenario scripts plus one runnable command added to `package.json`. The acceptance is that a single command exercises prompt injection, exfiltration, approval abuse, and queue-stress scenarios and leaves behind a reproducible pass/fail result.

## Concrete Steps

All commands below run from `/home/reese/projects/agentwall`.

Tonight’s orchestration steps are:

    mkdir -p execplan
    test -f execplan/2026-04-21-runtime-security-spine.md
    npm test -- --runInBand tests/approval-webhook.test.ts tests/floodguard.test.ts tests/cli.test.ts tests/dashboard.test.ts

Expected output before code changes:

    Test Suites: 4 passed, 4 total
    Tests:       52 passed, 52 total

The implementation handoff for Milestone 1 goes to Codex with this scope:

    Goal: implement tamper-evident audit chaining for `/evaluate` events only.
    Touch only: `src/types.ts`, `src/audit/logger.ts`, `src/audit/chain.ts` (new), `src/dashboard/state.ts`, `tests/audit-chain.test.ts` (new), and the smallest necessary assertion update in `tests/dashboard.test.ts`.
    Do not edit unrelated docs, styles, or dashboard copy.

After Codex returns, Hermes should run:

    npm test -- --runInBand tests/audit-chain.test.ts tests/dashboard.test.ts
    npm run build

If those pass, Hermes should read the changed files, update the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections in this ExecPlan, then decide whether to keep pushing into Milestone 2 in the same session.

The next command block for Milestone 2, only after Milestone 1 is green, is:

    npm test -- --runInBand tests/audit-chain.test.ts tests/dashboard.test.ts tests/policy-runtime.test.ts
    npm run build

If Milestone 2 begins, create a second focused test file such as `tests/capability-ticket.test.ts` before adding issuance logic.

## Validation and Acceptance

Milestone 1 is accepted when a human can run the server and observe tamper-evident audit metadata on real policy evaluations. The minimal proof path is:

    npm run build
    AGENTWALL_CONFIG=examples/openclaw-monitor-first.config.yaml node dist/index.js

Then in another shell:

    curl -s http://127.0.0.1:3015/evaluate \
      -H 'content-type: application/json' \
      -d '{"agentId":"agent-a","sessionId":"session-a","plane":"tool","action":"bash_exec","payload":{"command":"id"},"provenance":[{"source":"user","trustLabel":"trusted"}],"flow":{"direction":"internal","labels":["destructive_action"],"highRisk":true}}'

Follow with a second similar request using `agent-b` and `session-b`. After the second request, fetching dashboard state should show two audit feed entries whose integrity data forms a linked chain. The second entry’s `previousHash` must equal the first entry’s `hash`, and the chain indexes must increment.

The code-level validation for Milestone 1 is:

    npm test -- --runInBand tests/audit-chain.test.ts tests/dashboard.test.ts
    npm run build

Acceptance is behavioral, not structural. It is not enough that a helper exists. The event returned from `/evaluate` and the audit feed state must actually expose the integrity metadata.

Milestone 2 is accepted when policy evaluation can issue a short-lived capability ticket object with enough information to constrain a later executor, and focused tests show expiration and envelope fields are present. Milestone 3 is accepted when a tool or MCP manifest can be marked untrusted or drifted and that state is visible to operators and policy. Milestone 4 is accepted when there is one repeatable regression command that exercises the high-value abuse paths and reports pass or fail.

## Idempotence and Recovery

Creating the `execplan/` directory and this plan file is safe to repeat. Re-running the focused tests is safe. The tamper-evident chain state in Milestone 1 is process-local, so restarting the server resets the chain head. That is acceptable for tonight’s first slice because the goal is local evidence integrity, not persistent ledger recovery. If a test fails mid-change, revert only the files in Milestone 1 scope or fix forward until the focused suite is green again. Because the repo is dirty, do not use blanket revert commands such as `git checkout -- .`; instead inspect and revert named files only.

## Artifacts and Notes

Baseline verification already produced this concise proof:

    > agentwall@0.1.0 test
    > node --experimental-vm-modules node_modules/.bin/jest --runInBand tests/approval-webhook.test.ts tests/floodguard.test.ts tests/cli.test.ts tests/dashboard.test.ts
    PASS tests/dashboard.test.ts
    PASS tests/cli.test.ts
    PASS tests/floodguard.test.ts
    PASS tests/approval-webhook.test.ts
    Test Suites: 4 passed, 4 total
    Tests:       52 passed, 52 total

The current lock now correctly points at Agentwall and names Codex as the coding lane:

    {
      "project": "agentwall",
      "path": "/home/reese/projects/agentwall",
      "owner": "hermes",
      "mode": "write",
      "task": "runtime security spine execplan and first milestone delegation",
      "notes": "Codex is the primary coding lane; Hermes orchestrates and reviews"
    }

## Interfaces and Dependencies

In `src/types.ts`, extend `AuditEvent` with a new integrity field. The stable shape at the end of Milestone 1 should be:

    export interface AuditIntegrity {
      chainIndex: number;
      hash: string;
      previousHash: string | null;
      algorithm: "sha256";
      status: "verified-local";
    }

    export interface AuditEvent {
      ...existing fields...
      integrity: AuditIntegrity;
    }

In `src/audit/chain.ts`, define a small process-local chain helper with stable names:

    export interface AuditChainState {
      chainIndex: number;
      previousHash: string | null;
    }

    export function canonicalizeAuditPayload(event: Omit<AuditEvent, "integrity">): string;
    export function chainAuditEvent(event: Omit<AuditEvent, "integrity">, state: AuditChainState): AuditEvent;

In `src/audit/logger.ts`, keep the public `emit(ctx, result)` function, but make it call `chainAuditEvent` before notifying sinks. Do not introduce a new dependency for hashing; use Node’s built-in `crypto.createHash`.

In `src/dashboard/state.ts`, preserve the new `event.integrity` fields when constructing `auditFeed` and any evidence records that should reference chain state. If a transformed object is used for `auditFeed`, it must expose at least `chainIndex`, `hash`, and `previousHash`.

In `tests/audit-chain.test.ts`, build the server through `buildServer(config)` and drive real `/evaluate` calls rather than unit-testing the hash helper in isolation. That proves the whole route and runtime path works.

Revision note: created this initial execution plan after verifying the current baseline and selecting Codex as the bounded implementation lane because the user explicitly asked that the right subagent get the task.
