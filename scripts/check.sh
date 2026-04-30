#!/usr/bin/env bash
set -euo pipefail

cd /home/reese/projects/agentwall

echo '[Agentwall] lint'
npm run lint

echo '[Agentwall] tests'
npm test

echo '[Agentwall] build'
npm run build

echo '[Agentwall] check complete'
