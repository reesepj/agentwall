# Agentwall Security Toolbox

Updated: 2026-04-25 22:38 CDT
Host: nyxserver
Wrapper: `/home/reese/.local/bin/hermes-security-scan`
Scan output root: `/home/reese/security-scans`

Agentwall now has a local Tier 1 defensive scanning stack available from Reese's user PATH. Use it for quick evidence before security claims, release prep, dependency updates, or runtime-control changes.

## Available tools

- `semgrep` 1.157.0 — static code/security rules
- `bandit` 1.9.4 — Python security scan
- `pip-audit` 2.10.0 — Python dependency CVEs
- `sslyze` 6.3.1 — TLS configuration testing
- `trivy` 0.70.0 — filesystem/container/dependency/secret scan
- `syft` 1.43.0 — SBOM generation
- `grype` 0.111.1 — vulnerability scan from filesystem/SBOM
- `gitleaks` 8.30.1 — secret detection
- `osv-scanner` 2.3.5 — ecosystem dependency vulnerability scan
- `nuclei` 3.8.0 — HTTP/network template scanning; templates installed at `/home/reese/nuclei-templates`

## Standard scan

```bash
export PATH="$HOME/.local/bin:$PATH"
hermes-security-scan /home/reese/projects/agentwall
```

The wrapper writes a timestamped artifact directory under `/home/reese/security-scans/` and lets each scanner fail independently so the run still produces evidence.

## First baseline result

Baseline output:

```text
/home/reese/security-scans/agentwall_-20260426T035745Z
```

Signal from the latest baseline:

- NPM audit: 0 vulnerabilities.
- Trivy: 0 package vulnerabilities and no active secret findings.
- Gitleaks: no leaks found.
- Bandit: no Python issues detected, but Agentwall is mostly TypeScript.
- Semgrep: 25 code findings remain under review in `security-triage.md`.

Fixed immediately after the first baseline:

- Fastify `CVE-2026-33806`: updated `fastify` from `5.8.4` to `5.8.5`.
- Transitive dev dependency findings from `npm audit`: fixed through lockfile updates to `handlebars 4.7.9`, `brace-expansion 1.1.14`, and `picomatch 2.3.2`.
- Fake PAT-shaped allowlist example in `.gitleaks.toml`: replaced with a non-token-shaped marker so Trivy no longer reports a fake secret.

## Real-time monitoring

Security activity is written to:

```text
/home/reese/.local/share/athena-security/events.jsonl
```

Watch it live:

```bash
athena-security-monitor --from-start
```

Or from the Agentwall repo:

```bash
npm run security:monitor
```

Run a scan and emit live events:

```bash
npm run security:scan
```

A long-running monitor is currently active in the Hermes process table for warning/critical scan events.

## How to use this in Agentwall work

- Run the wrapper before release or security-sensitive changes.
- Treat scanner output as triage evidence, not automatic truth.
- Fix real high-risk dependency findings first.
- Keep false-positive decisions documented so the same noise does not steal attention every run.
