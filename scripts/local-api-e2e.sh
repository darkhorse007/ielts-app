#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${BACKEND_LOG:-/tmp/ielts-api-e2e-backend.log}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/ielts-api-e2e-backend.pid}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"

cleanup() {
  bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
}
trap cleanup EXIT

bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$BACKEND_LOG" \
  --pid-file "$BACKEND_PID_FILE" \
  --health-url "http://127.0.0.1:8787/health" \
  --timeout-seconds 60

PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
npm run test:e2e --workspace @ielts/client

echo "local api e2e passed"
