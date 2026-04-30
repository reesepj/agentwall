# Channel-scoped agent guardrails and first admin visibility

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `software-development/execplan` guidance from Hermes `PLANS.md`. It is written so a new contributor can ship the feature from this file plus the current repository.

## Purpose / Big Picture

Agentwall already understands who is talking to an agent through `actor.channelId`, `actor.userId`, and `actor.roleIds`, but it still lacks a clean way to say “this exact agent in this exact Slack or Telegram surface gets stricter powers than the rest.” After this change, an operator can write policy rules that target both the human side and the agent side of a conversation. That enables concrete controls like “the finance assistant in Slack can answer questions but cannot touch the file system,” while a different agent in a direct Telegram thread can still request approval for broader actions.

The user-visible proof is simple. A declarative policy file can match `subject.agentId` or `subject.sessionId` together with `actor.channelId`, and `GET /rules` exposes that scope so an admin surface can later render it without guessing. A test will show one agent being blocked in one channel while another agent using the same action remains unaffected.

## Progress

- [x] (2026-04-21 05:08 UTC+8) Audited the current repo and confirmed that actor-scoped matching already exists in `src/policy/loader.ts`, but declarative rules cannot yet scope by `agentId` or `sessionId`.
- [x] (2026-04-21 05:08 UTC+8) Chose the smallest high-leverage slice: add declarative subject scoping and expose those scopes through the existing `GET /rules` API.
- [x] (2026-04-21 05:14 UTC+8) Implemented `match.subject.agentId[]` and `match.subject.sessionId[]` in `src/policy/loader.ts` and added structured rule scope metadata in `src/types.ts`.
- [x] (2026-04-21 05:14 UTC+8) Updated `GET /rules` to return structured `scope` metadata for declarative rules.
- [x] (2026-04-21 05:15 UTC+8) Added policy tests proving a shared Slack channel can block one named agent while leaving another agent unaffected.
- [x] (2026-04-21 05:15 UTC+8) Added server-level test proving `GET /rules` exposes actor, subject, and control scope for declarative rules.
- [x] (2026-04-21 05:15 UTC+8) Updated example policy files with a copy-pasteable Slack finance-room agent blocker.
- [x] (2026-04-21 05:16 UTC+8) Repaired a stray patch-marker block in `src/routes/dashboard.ts` that was breaking TypeScript compilation for server tests.
- [x] (2026-04-21 05:16 UTC+8) Verified the slice with `npm test -- --runInBand tests/policy-loader.test.ts tests/policy-runtime.test.ts`, full `npm test -- --runInBand`, and `npm run build`.

## Surprises & Discoveries

- Observation: The repo is already partway down this path. `src/types.ts` contains `actor.channelId`, `actor.userId`, `actor.roleIds`, and `control.executionMode`, and the loader already supports those matchers.
  Evidence: `tests/policy-loader.test.ts` already verifies a channel-and-role-scoped denial while the workspace is read-only.

- Observation: The existing live-control/admin surface does not yet have a dedicated rule-management UI, but `src/routes/policy.ts` already exposes `GET /rules`, which is the cleanest current seam for one-pane-of-glass visibility.
  Evidence: Before this slice, `GET /rules` returned only `id`, `description`, `plane`, `decision`, and `riskLevel`.

- Observation: `src/routes/dashboard.ts` contained literal `+` patch markers inside the command-deck builder, which caused TypeScript parsing failures when server tests imported `buildServer`.
  Evidence: The first focused test run failed with dozens of parse errors rooted at `src/routes/dashboard.ts:370` before the policy-runtime assertions even ran.

## Decision Log

- Decision: Start with declarative policy subject scoping instead of jumping straight to a dashboard rule editor.
  Rationale: The user asked for channel-specific guardrails tied to specific agents. The blocker is missing policy expression power, not missing paint. Once the policy model can express the control, the current file-backed runtime and hot reload path can already enforce it.
  Date/Author: 2026-04-21 / Hermes

- Decision: Reuse `GET /rules` for the first admin visibility slice.
  Rationale: This repo already has a stable rules endpoint. Returning structured scope data there is lower risk than inventing a new admin API and immediately moves toward the one-pane-of-glass requirement.
  Date/Author: 2026-04-21 / Hermes

## Outcomes & Retrospective

The first slice is complete. Agentwall can now express “this named agent” in declarative policy, not just “this human/channel/role.” That closes the main gap behind Reese’s request for Slack and Telegram guardrails tied to specific agents.

What shipped:

- `match.subject.agentId[]` and `match.subject.sessionId[]` in declarative rules
- structured `scope` metadata on loaded rules for actor, subject, and control scope
- `GET /rules` now returns `scope`, which gives the future one-pane-of-glass admin surface a real API seam
- example policy entries showing a Slack finance-room blocker for one named agent
- tests proving channel-plus-agent scoping works and that the rules API reports the scope
- a repair to a broken command-deck block in `src/routes/dashboard.ts` that was preventing policy-runtime test execution

What remains for the broader feature:

- a real admin workflow for adding/editing these rules from the dashboard instead of by policy file
- policy bundles for Slack and Telegram naming conventions so operators do not invent inconsistent `channelId` strings
- higher-order controls such as per-agent capability presets, per-channel overlays, and inherited defaults

This milestone achieved the enforcement primitive first, which was the right call. The next slice should be an operator-facing policy inventory or scoped-rule editor, not another expansion of raw matcher fields.

## Context and Orientation

The core policy model lives in `src/types.ts`. `AgentContext` is the request shape evaluated by Agentwall. It already includes `agentId`, optional `sessionId`, optional `actor`, and optional `control`. A “subject” in this plan means the agent or session being controlled. An “actor” means the human or external caller interacting with that agent through Slack, Telegram, Discord, or another surface.

Declarative rules are loaded in `src/policy/loader.ts`. That file defines the YAML/JSON schema, converts a declarative rule into a `match(ctx)` function, and returns `PolicyRule` objects. The runtime policy hot reload path lives in `src/policy/runtime.ts`, and `src/server.ts` wires loaded declarative rules into the `PolicyEngine`.

The enforcement API is `POST /evaluate` in `src/routes/policy.ts`. For this milestone, the admin visibility seam is also in `src/routes/policy.ts` through `GET /rules`.

The most relevant existing examples and tests are:

- `examples/policy.yaml`
- `examples/openclaw-monitor-first.policy.yaml`
- `tests/policy-loader.test.ts`
- `tests/policy-runtime.test.ts`

## Plan of Work

First, extend the declarative policy schema in `src/policy/loader.ts` to accept a new `match.subject` object containing `agentId` and `sessionId` arrays. The matcher builder should reject nothing extra here; it only needs to check whether the incoming `AgentContext.agentId` or `AgentContext.sessionId` falls inside the declared scope when those arrays are present.

Second, extend `PolicyRule` in `src/types.ts` with optional structured scope metadata for actor, subject, and control scope. This metadata is not used during enforcement. Its job is to preserve the declared rule envelope so admin APIs and later dashboard surfaces can display which channels, roles, agents, or sessions a rule applies to without reverse engineering the matcher function.

Third, update `src/routes/policy.ts` so `GET /rules` includes the optional scope metadata in the response. Keep built-in rules simple: if a rule has no structured scope metadata, the field can be omitted.

Fourth, extend `tests/policy-loader.test.ts` with a concrete business case. The test should load a rule that denies a mutating tool action only when both `subject.agentId` matches a named business agent and `actor.channelId` matches a named Slack or Telegram surface. The test must also prove that the same action from a different agent does not match that rule.

Fifth, add one API-level test, either in `tests/policy-runtime.test.ts` or a dedicated new test file, that boots the server with a declarative rule using subject scope, calls `GET /rules`, and verifies the returned rule includes `scope.subject.agentIds` and `scope.actor.channelIds`.

Finally, update both example policy files with one copy-pasteable sample rule that shows the exact pattern Reese asked for: a specific agent in a specific shared channel can answer but cannot perform risky tool actions or secret access. Keep the example narrow and concrete.

## Concrete Steps

Work from `/home/reese/projects/agentwall`.

1. Edit `src/types.ts` to add a structured optional scope shape on `PolicyRule`.
2. Edit `src/policy/loader.ts` to:
   - accept `match.subject.agentId[]` and `match.subject.sessionId[]`
   - include subject matchers in the rule predicate
   - return `scope` metadata for actor, subject, and control constraints when present
3. Edit `src/routes/policy.ts` so `GET /rules` returns the optional `scope` object.
4. Edit `tests/policy-loader.test.ts` to add a failing test for per-agent plus per-channel scoping, run the test, then make it pass.
5. Edit `tests/policy-runtime.test.ts` or add a small new test to verify `GET /rules` exposes the scope.
6. Edit `examples/policy.yaml` and `examples/openclaw-monitor-first.policy.yaml` to include one scoped rule example.
7. Run:
   - `npm test -- --runInBand tests/policy-loader.test.ts tests/policy-runtime.test.ts`
   - `npm test -- --runInBand`
   - `npm run build`

Expected focused verification outcome after implementation:

    PASS tests/policy-loader.test.ts
    PASS tests/policy-runtime.test.ts

Expected full verification outcome after implementation:

    PASS tests/...
    TypeScript build completes with no errors.

## Validation and Acceptance

Acceptance is behavioral.

A declarative rule like the following must work:

    - id: "custom:deny-finance-agent-file-write-in-shared-slack"
      description: "Shared Slack finance room cannot drive file writes through the finance analyst agent"
      plane: "tool"
      match:
        action:
          includes: ["write", "patch", "exec"]
        actor:
          channelId: ["slack:finance-room"]
        subject:
          agentId: ["finance-analyst-agent"]
      decision: "deny"
      riskLevel: "high"
      reason: "Shared business channel cannot mutate the agent filesystem"

Proof of success has three parts.

First, a policy-engine test must show that `finance-analyst-agent` in `slack:finance-room` is denied for a mutating tool action.

Second, the same tool action from another agent, or the same agent in a different channel, must not match that custom rule.

Third, `GET /rules` must include a scope object similar to:

    {
      "subject": { "agentIds": ["finance-analyst-agent"] },
      "actor": { "channelIds": ["slack:finance-room"] }
    }

That proves the one-pane-of-glass admin surface has a trustworthy API seam.

## Idempotence and Recovery

These edits are safe to repeat. Declarative policy files are already file-backed and hot-reloadable, so changing the schema is additive as long as existing files still parse. If a schema or test edit goes wrong, revert the affected file and rerun the focused tests. If a declarative rule reload fails at runtime, `FileBackedPolicyRuntime` already preserves the last known good rules, so the service does not lose its prior enforcement set.

## Artifacts and Notes

Important existing example that proves the current baseline before this change:

    - id: "custom:deny-discord-moderator-shell-when-read-only"
      match:
        actor:
          channelId: ["discord:ops"]
          roleId: ["moderator"]
        control:
          executionMode: ["read_only"]

The new subject scope extends that pattern rather than replacing it.

## Interfaces and Dependencies

In `src/types.ts`, `PolicyRule` must end with an optional `scope` field that can carry structured scope metadata for later admin/UI use. A suitable end state is:

    export interface PolicyRuleScope {
      actor?: {
        channelIds?: string[];
        userIds?: string[];
        roleIds?: string[];
      };
      subject?: {
        agentIds?: string[];
        sessionIds?: string[];
      };
      control?: {
        executionModes?: Array<"normal" | "read_only" | "answer_only">;
      };
    }

    export interface PolicyRule {
      id: string;
      description: string;
      plane: Plane | "all";
      match: (ctx: AgentContext) => boolean;
      decision: Decision;
      riskLevel: RiskLevel;
      reason: string;
      scope?: PolicyRuleScope;
    }

In `src/policy/loader.ts`, the declarative matcher schema must accept:

    subject:
      agentId: ["..."]
      sessionId: ["..."]

and `buildMatch(...)` must enforce both constraints when present.

In `src/routes/policy.ts`, `GET /rules` must return `scope` when a rule provides it.

Revision note: created this plan to turn Reese’s Slack/Telegram per-agent guardrail request into a small shipped slice instead of a vague future dashboard promise.