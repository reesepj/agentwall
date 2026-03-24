# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-23

### Added
- Core policy evaluation API with provenance-aware decisions.
- Egress guardrails: default-deny, SSRF/private-range controls, host/scheme/port constraints.
- DLP inspection for common secrets and PII classes.
- Human approval flow with persistent queue backend.
- Dashboard views for decision stream, policy drilldowns, and approvals.
- OpenClaw monitor-first integration helpers and preflight adapters.
- Launch-facing docs: architecture, threat model, MVP, product thesis, release strategy.
- Public portfolio page and screenshot bundle for launch/demo assets.
- Community baseline files (`SECURITY.md`, `CONTRIBUTING.md`, issue/PR templates, CoC).
- CI workflow for lint/build/test/audit on push + pull requests.

### Notes
- Final public launch still requires repository metadata + external account setup handled by maintainer.
