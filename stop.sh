#!/usr/bin/env bash
# Stop only this checkout's recorded supervisor and child processes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec node "${ROOT}/scripts/dev-server.mjs" stop "$@"
