#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AGENTWALL_URL="${AGENTWALL_URL:-http://127.0.0.1:3000}"

if [[ ! -d node_modules ]]; then
  echo "node_modules missing; installing locked dependencies with npm ci"
  npm ci
fi

echo "==> Type-checking"
npm run lint

echo "==> Building"
npm run build

echo "==> Testing"
npm test -- --runInBand

echo "==> Auditing high+ vulnerabilities"
npm audit --audit-level=high

cat <<EOF

Agentwall deploy check passed.
Start locally:
  npm run start

Smoke the running service:
  AGENTWALL_URL=$AGENTWALL_URL npm run smoke:local

Default service URL:
  $AGENTWALL_URL
EOF
