# Community Issue Seed (First 3)

Use these as initial public issues right after launch. They are intentionally scoped so a maintainer can create them without inventing labels or copy.

## Create all three with GitHub CLI

Run after GitHub auth is available and the public repo exists. The commands intentionally create temporary body files so they work with stock `gh issue create` and create the non-default labels first.

```bash
gh label create ui --repo reesepj/agentwall --color "1d76db" --description "Dashboard and browser-facing work" || true
gh label create cli --repo reesepj/agentwall --color "5319e7" --description "Command-line interface work" || true
cat > /tmp/agentwall-issue-1.md <<'EOF'
### Goal
Make the dashboard easier to investigate by filtering decision history without editing code or scanning the whole feed.

### Scope
- Add query params + UI controls for filtering by `decision`, `riskLevel`, and `plane`.
- Preserve filter state in URL.
- Add tests for server route/state shaping.

### Acceptance criteria
- Operators can filter dashboard decision data by decision, risk level, and plane.
- Filter state survives page refresh through URL params.
- Tests cover the state shape and at least one filtered view.
EOF

gh issue create --repo reesepj/agentwall \
  --title "good first issue: add structured decision filters to dashboard" \
  --label "good first issue" --label enhancement --label ui \
  --body-file /tmp/agentwall-issue-1.md

cat > /tmp/agentwall-issue-2.md <<'EOF'
### Goal
Let operators evaluate many sample action contexts offline before pushing policy changes into a live Agentwall runtime.

### Scope
- Add `agentwall simulate --input <file>` to evaluate a batch of contexts offline.
- Output summary table + JSON mode.
- Include docs/example input file.

### Acceptance criteria
- `agentwall simulate --input examples/simulation-input.json` runs without a live server.
- Output includes decision counts and per-item decision details.
- JSON output mode is stable enough for CI or scripts.
EOF

gh issue create --repo reesepj/agentwall \
  --title "help wanted: policy rule simulator CLI command" \
  --label "help wanted" --label enhancement --label cli \
  --body-file /tmp/agentwall-issue-2.md

cat > /tmp/agentwall-issue-3.md <<'EOF'
### Goal
Make Agentwall's detection model easier for new contributors and security reviewers to understand.

### Scope
- Expand `docs/threat-model.md` with detection-to-mitigation mapping.
- Add examples of false-positive/false-negative handling.
- Link from README under product docs.

### Acceptance criteria
- Threat model docs include a table mapping detections to mitigations.
- Docs explain at least one false-positive and one false-negative example.
- README links the improved taxonomy section.
EOF

gh issue create --repo reesepj/agentwall \
  --title "good first issue: detection taxonomy documentation improvements" \
  --label "good first issue" --label documentation \
  --body-file /tmp/agentwall-issue-3.md
```

<a id="issue-1"></a>
## 1) good first issue: add structured decision filters to dashboard
**Labels:** `good first issue`, `enhancement`, `ui`

### Goal
Make the dashboard easier to investigate by filtering decision history without editing code or scanning the whole feed.

### Scope
- Add query params + UI controls for filtering by `decision`, `riskLevel`, and `plane`.
- Preserve filter state in URL.
- Add tests for server route/state shaping.

### Acceptance criteria
- Operators can filter dashboard decision data by decision, risk level, and plane.
- Filter state survives page refresh through URL params.
- Tests cover the state shape and at least one filtered view.

<a id="issue-2"></a>
## 2) help wanted: policy rule simulator CLI command
**Labels:** `help wanted`, `enhancement`, `cli`

### Goal
Let operators evaluate many sample action contexts offline before pushing policy changes into a live Agentwall runtime.

### Scope
- Add `agentwall simulate --input <file>` to evaluate a batch of contexts offline.
- Output summary table + JSON mode.
- Include docs/example input file.

### Acceptance criteria
- `agentwall simulate --input examples/simulation-input.json` runs without a live server.
- Output includes decision counts and per-item decision details.
- JSON output mode is stable enough for CI or scripts.

<a id="issue-3"></a>
## 3) good first issue: detection taxonomy documentation improvements
**Labels:** `good first issue`, `documentation`

### Goal
Make Agentwall's detection model easier for new contributors and security reviewers to understand.

### Scope
- Expand `docs/threat-model.md` with detection-to-mitigation mapping.
- Add examples of false-positive/false-negative handling.
- Link from README under product docs.

### Acceptance criteria
- Threat model docs include a table mapping detections to mitigations.
- Docs explain at least one false-positive and one false-negative example.
- README links the improved taxonomy section.
