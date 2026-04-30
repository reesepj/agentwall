# Agentwall Dashboard UI Audit — 2026-04-30

## Verdict

Agentwall is powerful enough now. The next UI risk is density, not capability.

The dashboard should default to a clean operator surface and reveal granular control only when the operator explicitly enables Advanced User mode.

## What works

- Runtime status is visible immediately.
- The top posture message is clear: Agentwall is protecting runtime actions.
- The Command Deck gives a useful first-read surface.
- Empty states explain missing telemetry instead of leaving dead panels.
- The Advanced surface now carries real power: org federation, scoped guardrails, runtime flows, evidence, audit, inspection telemetry, and drilldowns.

## Main problems found

1. Too many panels compete for attention in idle state.
   - Organization topology, policy internals, guardrail editing, audit, evidence, event feed, and inspection telemetry are all useful, but not all belong in the default operator view.

2. Empty diagnostic sections create noise.
   - Repeated “no runtime flows / no evidence / no task graph / no audit history” messages make the product feel more complex than it is.

3. The inline Guardrail Editor is too prominent for default use.
   - It is powerful, but it is also a sharp tool. It should live behind an explicit advanced switch.

4. Status badges and action buttons can visually blur together.
   - Future pass should make configured decisions look less clickable and real actions more obviously actionable.

5. “Open hottest session” can appear when only control-plane boot/session state exists.
   - The default view should not imply a live agent session exists when runtime telemetry says none exists.

## Change made in this slice

- Replaced the old Core/Advanced tab pair with an **Advanced User** slider.
- Default remains **Operator View**:
  - clear posture
  - command deck
  - queue/risk/session summaries
  - low cognitive load
- Slider activates **Advanced User** mode:
  - org federation
  - scoped guardrails
  - full guardrail editor
  - runtime flows/sessions
  - evidence/task graph
  - audit and inspection telemetry
  - drilldowns and rawer operational internals
- Added helper copy so the user knows the slider reveals granular controls, not a different app.
- Stopped surfacing “Open hottest session” when there are no live runtime sessions.
- Hardened safety after review:
  - default view no longer exposes the `never` approval-mode bypass control
  - advanced-only panel links automatically enable Advanced User before scrolling
  - dangerous guardrail saves now require confirmation for `allow`, disabled rules, or `all`-plane scope
  - any remaining `never` approval-mode path requires explicit confirmation because it auto-approves approval-required requests

## Athena review findings and fixes

Athena blocked the first pass on three points:

1. Default Operator View exposed `approval.mode=never`, which auto-approves approval-required requests.
2. Core CTAs pointed at hidden advanced panels without switching modes; fixed with `closest(".advanced-panel")` detection.
3. The live guardrail editor could save permissive or broad changes without confirmation.

All three were fixed in this slice.

## Recommended next UI passes

1. Collapse empty diagnostic groups into one compact “No runtime activity yet” card.
2. Make policy decision badges visually distinct from clickable actions.
3. Add command palette/search for sessions, rules, agents, channels, and peer instances.
4. Add compact density toggle for power users with high-volume telemetry.
5. Add guarded confirmation around high-impact policy edits and remote write-through when that lands.
