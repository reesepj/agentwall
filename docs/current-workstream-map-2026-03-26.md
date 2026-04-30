# Agentwall Workstream Map — 2026-03-26

Primary goal: make Agentwall feel intentional, lean, and operator-clear.

## Current active diff buckets

### Docs and narrative
- `CHANGELOG.md`
- `README.md`
- `docs/agentwall-portfolio.md`
- `docs/brand.md`
- `docs/roadmap.md`
- `docs/runtime-floodguard.md`

### Core server / control plane
- `src/approval/gate.ts`
- `src/cli.ts`
- `src/config.ts`
- `src/dashboard/state.ts`
- `src/routes/approval.ts`
- `src/routes/dashboard.ts`
- `src/routes/policy.ts`
- `src/server.ts`

### Runtime-specific logic
- `src/runtime/floodguard.ts`

### Public / UI surface
- `public/app.js`
- `public/index.html`
- `public/portfolio.html`
- `public/styles.css`
- `public/assets/agentwall-mark.svg`
- `public/assets/brand/*`

### Tests
- `tests/dashboard.test.ts`
- `tests/cli.test.ts`
- `tests/floodguard.test.ts`

### Ops / repo control
- `.github/workflows/security.yml`
- `.gitleaks.toml`
- `scripts/check.sh`
- `scripts/deploy.sh`
- `state/openclaw-agentwall-approvals.json`

## First cleanup sequence
1. Keep docs aligned to one product narrative.
2. Keep runtime/control work separate from brand/portfolio work.
3. Make public assets look deliberate, not accumulated.
4. Avoid mixing state artifacts into product commits unless necessary.

## Verification snapshot
- `npm run lint` ✅
- `npm test -- --runInBand` ✅
- `npm run build` ✅

## Non-goals in this pass
- broad architecture rewrites
- new product surfaces just because they sound cool
- touching Titan or Mission Control unless needed for operator consistency
