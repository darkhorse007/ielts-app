#!/usr/bin/env bash
set -euo pipefail

PID_FILE="${1:-server.pid}"

if [[ -f "$PID_FILE" ]]; then
  kill "$(cat "$PID_FILE")" >/dev/null 2>&1 || true
fi
