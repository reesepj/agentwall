# Agentwall Final Launch Checklist (Edge-of-Publish)

This checklist reflects the repo state after closeout.  
Only true last-mile maintainer/admin steps are left unchecked.

## 1) Security + hygiene
- [x] No real secrets, tokens, credentials, or personal IDs in source/docs/examples.
- [x] Runtime artifacts ignored (`agentwall-approvals.json`, logs, local env files).
- [x] `.gitignore` excludes local/runtime drift (`node_modules`, `dist`, env files, logs).
- [x] Dependency audit command included in CI (`npm audit --audit-level=high`).
- [x] Threat model doc present (`docs/threat-model.md`) and linked from docs set.

## 2) OSS trust baseline
- [x] `LICENSE` exists and matches `package.json`.
- [x] `SECURITY.md` with reporting process and response targets.
- [x] `CONTRIBUTING.md` with setup/test/lint workflow.
- [x] `CODE_OF_CONDUCT.md` present.
- [x] Issue + PR templates present.

## 3) Product clarity
- [x] README opens with clear value proposition + architecture wedge.
- [x] Open vs commercial/private boundary documented.
- [x] Quickstart path documented and runnable from clean clone.
- [x] API examples are copy/paste runnable.
- [x] “Approval in action” + denial/policy evidence represented in docs/tests/screens.

## 4) Adoption readiness
- [x] Minimal sample config and policy files are valid.
- [x] `npm test` and `npm run build` pass.
- [x] Local deploy readiness path scripted (`npm run deploy:check`) and documented.
- [x] Live runtime smoke path scripted (`npm run smoke:local`) and documented.
- [x] Version is set (`0.1.0`) and changelog drafted (`CHANGELOG.md`).
- [x] CI automation in place (`.github/workflows/ci.yml`).
- [x] GitHub Pages workflow present for static launch surface (`.github/workflows/pages.yml`).

## 5) Last-mile admin (maintainer-owned)
- [ ] Configure GitHub repo description, topics, homepage, and social preview image.
- [x] Canonical public clone URL selected and reflected in README (`https://github.com/reesepj/agentwall.git`).
- [ ] Push the launch branch once GitHub auth is available. Current blocker: local GitHub HTTPS auth is unavailable (`fatal: could not read Username for 'https://github.com'`). Exact next command: `gh auth login && git push -u origin launch/agentwall-public-ready`.
- [ ] Enable GitHub Pages source as `GitHub Actions` after the repo is public. If GitHub auth is unavailable locally, run: `gh auth login`, then push this branch and enable Pages from Actions in repository settings.
- [ ] Create initial release tag (`v0.1.0`) and attach release notes.
- [ ] Publish announcement post (problem, why now, demo, quickstart, roadmap).
- [ ] Final external account setup items chosen by the maintainer (public inboxes + service accounts).

## 6) Immediate post-launch guardrails
- [ ] Enable notifications/triage routine for issues and security reports.
- [x] Prepare first three community issues (`good first issue` + `help wanted`) in `docs/community-issues-seed.md`, including copy-ready bodies and `gh issue create` commands for when GitHub auth is available.
- [ ] Open first public roadmap milestone and label policy.

---

## Verification snapshot (local)
- `npm test` ✅
- `npm run build` ✅

Agentwall is effectively launch-ready from a code/docs/repo baseline perspective, pending only maintainer-controlled admin/account steps above.
