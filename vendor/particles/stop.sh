#!/usr/bin/env bash
# stop.sh — tear down everything start.sh brought up.
#
# Kills the Vite dev server and anything still camping on the configured port.
# Safe to run when nothing is running.

set -euo pipefail

PORT=${PORT:-5174}
HMR_PORT=${HMR_PORT:-24678}
ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="${ROOT}/.dev.pid"

stopped_anything=0

if [ -f "${PID_FILE}" ]; then
  PID=$(cat "${PID_FILE}")
  if kill -0 "${PID}" 2>/dev/null; then
    echo "→ stopping dev server (pid ${PID})"
    kill "${PID}" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "${PID}" 2>/dev/null || break
      sleep 0.25
    done
    kill -9 "${PID}" 2>/dev/null || true
    stopped_anything=1
  fi
  rm -f "${PID_FILE}"
fi

free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  if [ -n "${pids}" ]; then
    echo "→ freeing port ${port} (pids: ${pids})"
    echo "${pids}" | xargs kill -9 2>/dev/null || true
    stopped_anything=1
  fi
}

free_port "${PORT}"
free_port "${HMR_PORT}"

if [ "${stopped_anything}" -eq 0 ]; then
  echo "✓ nothing to stop"
else
  echo "✓ stopped"
fi
