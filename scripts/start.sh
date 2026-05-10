#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building web/"
( cd web && npm install --no-fund --no-audit && npm run build )

echo "→ Starting server on http://127.0.0.1:8000"
exec uv --project server run uvicorn otter.main:app --host 127.0.0.1 --port 8000
