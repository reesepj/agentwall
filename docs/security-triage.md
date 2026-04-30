# Agentwall Security Triage

Updated: 2026-04-25 22:55 CDT
Latest baseline: `/home/reese/security-scans/agentwall_-20260426T035745Z`

## Current status

No confirmed dependency vulnerabilities or secret leaks remain in the latest baseline.

Verified:
- `npm audit --audit-level=moderate` -> 0 vulnerabilities
- Trivy package scan -> 0 vulnerabilities
- Trivy secret scan -> no current secret finding after removing the fake PAT-shaped allowlist example
- Gitleaks -> no leaks found
- Tests -> 108 passed / 19 suites
- Build -> `npm run build` passed

## Fixed immediately

| Finding | Source | Status | Fix |
|---|---|---|---|
| Fastify `CVE-2026-33806`, installed `5.8.4`, fixed `5.8.5` | Trivy / npm audit | Fixed | Updated Fastify to `5.8.5` and refreshed lockfile |
| Vulnerable transitive dev dependencies: `handlebars`, `brace-expansion`, `picomatch` | npm audit | Fixed | Ran `npm audit fix`; lockfile now resolves `handlebars 4.7.9`, `brace-expansion 1.1.14`, `picomatch 2.3.2` |
| Fake GitHub PAT-shaped example in `.gitleaks.toml` triggered Trivy secret detection | Trivy | Fixed | Replaced fake token-shaped allowlist example with `FAKE_GITHUB_PAT_EXAMPLE` |

## Semgrep findings still under review

Semgrep still reports 25 code findings. These are not currently confirmed exploitable vulnerabilities, but they are tracked until explicitly fixed or accepted.

Buckets:

| Class | Count | Initial disposition |
|---|---:|---|
| Manual HTML escaping in `public/app.js` | 4 | Review. Current escape order is correct for HTML insertion, but replacing with DOM construction or a sanitizer would reduce scanner noise. |
| HTTP usage in local smoke scripts | 2 | Likely accepted local-dev noise. These scripts target local Agentwall endpoints. |
| `child_process.spawnSync` in `scripts/security-regression.js` | 1 | Review/low risk. Inputs are hardcoded test groups and local npm command, not user-controlled runtime input. |
| Path resolution / traversal warnings | 11 | Review. Many are config/local file probes; verify every externally configurable path is intended and not reachable from untrusted dashboard/API input. |
| Prototype-pollution warning in dashboard state object counting | 1 | Review/fix candidate. Prefer `Map` or null-prototype objects in counting helpers. |
| Direct response writes in Fastify routes | 6 | Likely false positive for JSON `reply.send(...)`; verify no route sends unescaped user-controlled HTML. |

Rule: a finding does not get marked accepted until the reason is written here. Real vulnerabilities get fixed before the baseline is considered clean.
