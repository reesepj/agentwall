# Scoped guardrail dashboard inventory and editor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` guidance loaded through the Hermes `execplan` skill.

## Purpose / Big Picture

Agentwall can now enforce scoped guardrails for a specific agent in a specific Slack or Telegram surface, but operators still have to edit YAML by hand. After this change, the dashboard will expose a focused scoped-guardrail inventory plus a first editor path for creating and updating those rules from the one-pane operator surface.

The user-visible proof is: the dashboard state includes a `policyCatalog.scopedRules` collection, the browser UI shows those scoped rules and a composer form, and a dashboard control API can upsert a scoped rule into the file-backed policy, hot-reload it, and return the updated inventory.

## Progress

- [x] (2026-04-21 05:34 UTC+8) Inspected the existing policy panel and confirmed it only renders decision mix plus hotspot counts.
- [x] (2026-04-21 05:34 UTC+8) Chose the smallest useful slice: scoped-rule inventory plus upsert editor, not a full generic YAML policy IDE.
- [x] (2026-04-21 05:45 UTC+8) Extended the file-backed policy runtime to keep raw declarative rule definitions in sync with compiled rules and support scoped-rule upserts.
- [x] (2026-04-21 05:49 UTC+8) Exposed `policyCatalog.scopedRules` through `/api/dashboard/state` and added `POST /api/dashboard/control/policy-scoped-rule`.
- [x] (2026-04-21 05:51 UTC+8) Rendered scoped-rule inventory plus a first dashboard guardrail editor in the policy panel.
- [x] (2026-04-21 05:53 UTC+8) Verified the slice with `npm test -- --runInBand tests/dashboard.test.ts tests/policy-runtime.test.ts`, full `npm test -- --runInBand`, and `npm run build`.

## Surprises & Discoveries

- Observation: The current dashboard already has a “Policy Execution” panel, but it is telemetry-only.
  Evidence: `public/app.js` had `renderPolicy(state)` that only filled `policy-stats` and `policy-hotspots`.

- Observation: `buildServer` already wires an optional `FileBackedPolicyRuntime`, so the cleanest write path is to extend that runtime instead of inventing a parallel policy writer.
  Evidence: `src/server.ts` constructs `policyRuntime` from `config.policy.configPath` and uses it for hot reload.

- Observation: The focused red test exposed that `policyCatalog` was entirely absent from dashboard state, which confirmed the operator editor really did need new server-owned state rather than just browser plumbing.
  Evidence: the first focused run failed on `initialState.json().policyCatalog` being `undefined` in `tests/policy-runtime.test.ts`.

## Decision Log

- Decision: Scope the first editor to declarative scoped rules only.
  Rationale: Reese asked for channel- and agent-specific guardrails. A focused editor for scoped rules gets the core operator value without turning the dashboard into a brittle general YAML editor.
  Date/Author: 2026-04-21 / Hermes

- Decision: Support create and update through one upsert endpoint before adding delete.
  Rationale: Add/update is enough to stop hand-editing for the main guardrail workflow. Delete can come as a second slice once the inventory and write path are stable.
  Date/Author: 2026-04-21 / Hermes

## Outcomes & Retrospective

This slice shipped.

What exists now:

- `FileBackedPolicyRuntime` keeps both compiled rules and raw declarative rule definitions in sync.
- `/api/dashboard/state` returns `policyCatalog` with `editable`, `policyPath`, `note`, and `scopedRules`.
- `/api/dashboard/control/policy-scoped-rule` can create or update a scoped guardrail in the file-backed policy and hot-reload it immediately.
- the dashboard policy panel now includes `Scoped Guardrails` inventory plus a `Guardrail editor` form.
- operators can click `Edit guardrail`, change the scoped rule fields, and save without touching YAML directly.

This is intentionally a narrow editor, not a full policy IDE. It is optimized for the exact guardrail pattern Reese asked for: channel/user/role scope plus agent/session/execution-mode scope.

What remains:

- delete/disable workflows beyond the basic enabled toggle
- richer validation hints in the browser before submit
- presets for Slack and Telegram naming patterns so operators do not invent inconsistent `channelId` strings
- a broader generic policy editor for non-scoped declarative rules if that becomes worth the complexity

The important outcome is that Agentwall now has an actual one-pane operator path for the first real scoped-guardrail workflow. That moves the product from “engine capability” to “operator capability.”

## Context and Orientation

The current file-backed declarative rule pipeline starts in `src/policy/loader.ts`, where YAML/JSON rules are parsed into `PolicyRule` objects. `src/policy/runtime.ts` watches the policy file and reloads rules into memory. `src/server.ts` passes the runtime into the policy engine. `src/routes/dashboard.ts` owns dashboard state and mutating operator control routes. `public/index.html` defines the policy panel shell, and `public/app.js` renders the dashboard plus handles operator button clicks.

For this slice, a “scoped rule” means a declarative policy rule that uses at least one of these match blocks:

- `match.actor`
- `match.subject`
- `match.control`

Those are the rules operators need for “Slack room X cannot drive agent Y to do Z.”

## Plan of Work

First, extend the declarative policy loader/runtime boundary so the runtime can expose raw declarative rule definitions, not just compiled matcher functions. That means exporting the declarative rule type from `src/policy/loader.ts`, adding a function to read the raw policy file, and letting `FileBackedPolicyRuntime` keep both compiled rules and raw definitions in sync.

Second, add an upsert method to `FileBackedPolicyRuntime` that accepts a scoped declarative rule definition, writes it into the current policy file by rule id, and reloads the runtime. Keep it additive and safe: same id means replace, missing id means append. If reload fails, return the error and keep the last good compiled rules.

Third, extend `dashboardRoutes(...)` to accept the optional `policyRuntime`. Add `policyCatalog` onto `/api/dashboard/state` with an `editable` flag and a `scopedRules` array that is already display-ready for the browser. Add `POST /api/dashboard/control/policy-scoped-rule` to validate incoming form data, translate it into a declarative rule, call the runtime upsert method, refresh the engine, and return the saved catalog row.

Fourth, expand the policy panel in `public/index.html` and `public/app.js`. Keep the existing telemetry cards, but add a scoped-rule inventory plus a “Guardrail editor” form. The form should support create and update for the narrow scoped-rule shape Reese needs now: plane, action includes, decision, risk, reason, actor channel/role/user scope, subject agent/session scope, control execution mode, and enabled state.

Fifth, add tests before implementation. One route test must prove the dashboard state exposes `policyCatalog.scopedRules` and that the upsert endpoint writes a new rule into the file-backed runtime. One dashboard test must assert the shell/app bundle includes the new “Scoped Guardrails” / “Guardrail editor” operator copy.

## Concrete Steps

Work from `/home/reese/projects/agentwall`.

1. Add failing route/UI assertions in:
   - `tests/dashboard.test.ts`
   - `tests/policy-runtime.test.ts` or a new focused policy-editor test
2. Extend `src/policy/loader.ts` to export the declarative rule/file types and a raw policy-file loader.
3. Extend `src/policy/runtime.ts` with:
   - raw definition storage
   - `getDeclarativeRules()`
   - `upsertDeclarativeRule(...)`
4. Update `src/server.ts` and `src/routes/dashboard.ts` so dashboard state and control routes can use `policyRuntime`.
5. Update `public/index.html` with containers for the scoped-rule inventory/editor.
6. Update `public/app.js` to render the new policy inventory and handle create/edit actions.
7. Add minimal CSS in `public/styles.css` for the new editor fields if existing form styles are not enough.
8. Run:
   - `npm test -- --runInBand tests/dashboard.test.ts tests/policy-runtime.test.ts`
   - `npm test -- --runInBand`
   - `npm run build`

## Validation and Acceptance

Acceptance is behavioral.

A dashboard state response from a file-backed policy config must include something like:

    {
      "policyCatalog": {
        "editable": true,
        "scopedRules": [
          {
            "id": "custom:deny-finance-agent-file-write-in-shared-slack",
            "description": "Shared Slack finance room cannot drive filesystem writes through the finance analyst agent",
            "scopeSummary": "finance-analyst-agent in slack:finance-room",
            "editable": true
          }
        ]
      }
    }

A control request like this must write or update the scoped rule and leave the runtime healthy:

    POST /api/dashboard/control/policy-scoped-rule
    {
      "id": "custom:deny-finance-agent-file-write-in-shared-slack",
      "description": "Shared Slack finance room cannot drive filesystem writes through the finance analyst agent",
      "plane": "tool",
      "actionIncludes": ["write", "patch"],
      "decision": "deny",
      "riskLevel": "high",
      "reason": "Shared business channels cannot mutate the finance analyst agent filesystem",
      "actorChannelIds": ["slack:finance-room"],
      "subjectAgentIds": ["finance-analyst-agent"],
      "enabled": true
    }

The dashboard UI must visibly contain the strings `Scoped Guardrails`, `Guardrail editor`, and an action path for editing an existing scoped rule.

## Idempotence and Recovery

The upsert route must be idempotent by rule id. Saving the same rule twice should replace the same declarative entry, not duplicate it. If the write or reload fails, the endpoint must return an error and the compiled runtime must remain on the last known good rules. The policy file is the source of truth, so the write path must always round-trip through the file-backed runtime rather than mutating only in-memory state.

## Artifacts and Notes

The policy panel already has two useful blocks that should stay in place:

    <div id="policy-stats" class="stack"></div>
    <div id="policy-hotspots" class="stack"></div>

This slice adds scoped-rule inventory/editor beside or beneath those blocks rather than replacing them.

## Interfaces and Dependencies

`src/policy/loader.ts` must export the typed declarative rule shape so the runtime and dashboard route can share one source of truth.

`src/policy/runtime.ts` must end this slice with methods equivalent to:

    getDeclarativeRules(): DeclarativePolicyRule[]
    upsertDeclarativeRule(rule: DeclarativePolicyRule): ReloadResult & { definitions: DeclarativePolicyRule[] }

`src/routes/dashboard.ts` must expose:

    GET /api/dashboard/state -> includes policyCatalog
    POST /api/dashboard/control/policy-scoped-rule -> validates, writes, reloads, returns saved rule/catalog

Revision note: created this plan to turn the new scoped guardrail engine primitive into an actual operator workflow instead of stopping at file-backed YAML.