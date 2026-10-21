#!/usr/bin/env bash
# start.sh — boot the three-js-particles playground dev server.
#
# Always claims port 5174 by killing whatever is on it, launches Vite from the
# playground app in the background, and waits for the "Local:" banner before
# returning.

set -euo pipefail

PORT=${PORT:-5174}
HMR_PORT=${HMR_PORT:-24678}
ROOT="$(cd "$(dirname "$0")" && pwd)"
PLAYGROUND="${ROOT}/apps/playground"
LOG_DIR="${ROOT}/.dev-logs"
SERVER_LOG="${LOG_DIR}/server.log"
PID_FILE="${ROOT}/.dev.pid"

mkdir -p "${LOG_DIR}"

free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  if [ -n "${pids}" ]; then
    echo "  ↳ freeing port ${port} (pids: ${pids})"
    echo "${pids}" | xargs kill -9 2>/dev/null || true
  fi
}

echo "→ cleaning up old processes"
free_port "${PORT}"
free_port "${HMR_PORT}"

# Wait for the OS to release the sockets before re-binding.
sleep 0.5

echo "→ starting Vite dev server on port ${PORT}"
: > "${SERVER_LOG}"
SERVER_PID=$(
  PORT="${PORT}" PLAYGROUND="${PLAYGROUND}" SERVER_LOG="${SERVER_LOG}" python3 - <<'PY'
import os
import subprocess

log = open(os.environ["SERVER_LOG"], "ab", buffering=0)
process = subprocess.Popen(
    ["npx", "vite", "--port", os.environ["PORT"], "--host", "127.0.0.1", "--strictPort"],
    cwd=os.environ["PLAYGROUND"],
    env=os.environ,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid)
PY
)
echo "${SERVER_PID}" > "${PID_FILE}"

# Wait for the "Local:" banner so we know Vite is listening.
echo -n "  ↳ waiting for server"
for _ in $(seq 1 80); do
  if grep -q "Local:" "${SERVER_LOG}" 2>/dev/null; then
    echo " ready"
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo " crashed"
    echo ""
    echo "server failed to start — last 30 log lines:"
    tail -30 "${SERVER_LOG}"
    rm -f "${PID_FILE}"
    exit 1
  fi
  echo -n "."
  sleep 0.5
done

if ! grep -q "Local:" "${SERVER_LOG}" 2>/dev/null; then
  echo " timeout"
  echo ""
  echo "server failed to start — last 30 log lines:"
  tail -30 "${SERVER_LOG}"
  exit 1
fi

cat <<EOF

✓ three-js-particles playground is up

  ➜  Local:   http://localhost:${PORT}/
  ➜  PID:     ${SERVER_PID}
  ➜  Logs:    ${SERVER_LOG}
  ➜  Stop:    ./stop.sh

EOF
