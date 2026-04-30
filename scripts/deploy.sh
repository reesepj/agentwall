#!/usr/bin/env bash
set -euo pipefail

cd /home/reese/projects/agentwall

./scripts/check.sh

echo '[Agentwall] no canonical runtime restart configured yet'
echo '[Agentwall] deploy is repo-level verification only right now; add an explicit service/runtime target before using this as a live deploy path'
