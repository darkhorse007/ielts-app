#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${BACKEND_LOG:-/tmp/ielts-visual-backend.log}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/ielts-visual-backend.pid}"
FRONTEND_LOG="${FRONTEND_LOG:-/tmp/ielts-visual-frontend.log}"
FRONTEND_PID_FILE="${FRONTEND_PID_FILE:-/tmp/ielts-visual-frontend.pid}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"

cleanup() {
  bash scripts/ci/stop-server.sh "$FRONTEND_PID_FILE" || true
  bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
}
trap cleanup EXIT

bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$BACKEND_LOG" \
  --pid-file "$BACKEND_PID_FILE" \
  --health-url "http://127.0.0.1:8787/health" \
  --timeout-seconds 60

bash scripts/ci/start-server-and-wait.sh \
  --command "npm run dev --workspace @ielts/client" \
  --log-file "$FRONTEND_LOG" \
  --pid-file "$FRONTEND_PID_FILE" \
  --health-url "http://127.0.0.1:5173/login" \
  --timeout-seconds 90

PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
npm run test:e2e:visual --workspace @ielts/client

echo "local visual snapshots e2e passed"
