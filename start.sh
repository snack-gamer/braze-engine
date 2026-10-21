#!/usr/bin/env bash
# One owned dev server per checkout; default HTTP 5179, HMR 25179.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec node "${ROOT}/scripts/dev-server.mjs" start "$@"
