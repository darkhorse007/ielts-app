#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="server.log"
PID_FILE="server.pid"
HEALTH_URL="http://127.0.0.1:8787/health"
TIMEOUT_SECONDS=60
COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --command)
      COMMAND="$2"
      shift 2
      ;;
    --log-file)
      LOG_FILE="$2"
      shift 2
      ;;
    --pid-file)
      PID_FILE="$2"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="$2"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$COMMAND" ]]; then
  echo "--command is required" >&2
  exit 1
fi

bash -lc "$COMMAND" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for i in $(seq 1 "$TIMEOUT_SECONDS"); do
  if curl -s "$HEALTH_URL" >/dev/null; then
    exit 0
  fi
  sleep 1
done

echo "server start timeout after ${TIMEOUT_SECONDS}s"
cat "$LOG_FILE" || true
exit 1
