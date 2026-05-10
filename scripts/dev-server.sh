#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../server"
exec uv run uvicorn otter.main:app --host 127.0.0.1 --port 8000 --reload
