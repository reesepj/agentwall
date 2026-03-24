# Contributing to Agentwall

Thanks for contributing.

## Local setup

```bash
npm install
npm run build
npm test
```

## Development workflow

1. Create a feature branch.
2. Add or update tests for behavior changes.
3. Run:

```bash
npm run lint
npm test
npm run build
```

4. Open a pull request using the PR template.

## Code style

- Keep changes focused and small.
- Prefer explicit policy/risk semantics over implicit behavior.
- Include docs updates for user-visible behavior.

## Commit guidance

Use clear commit messages describing *why* the change exists, not just *what* changed.

## Security-sensitive contributions

For changes affecting policy enforcement, egress controls, approvals, or DLP logic, include:
- threat scenario addressed
- expected false-positive/false-negative tradeoffs
- test coverage for edge cases
