#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${BACKEND_LOG:-/tmp/ielts-frontend-full-backend.log}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/ielts-frontend-full-backend.pid}"
FRONTEND_LOG="${FRONTEND_LOG:-/tmp/ielts-frontend-full-frontend.log}"
FRONTEND_PID_FILE="${FRONTEND_PID_FILE:-/tmp/ielts-frontend-full-frontend.pid}"
PARALLEL_MODE="${FRONTEND_FULL_E2E_PARALLEL:-false}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

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

if is_truthy "$PARALLEL_MODE"; then
  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:frontend-full --workspace @ielts/client
else
  npm run test:e2e --workspace @ielts/client

  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:learner --workspace @ielts/client

  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:practice-writing-mock --workspace @ielts/client

  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:stability-page --workspace @ielts/client

  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:observability-storage --workspace @ielts/client

  PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" \
  PLAYWRIGHT_WEB_BASE_URL="http://127.0.0.1:5173" \
  npm run test:e2e:visual --workspace @ielts/client
fi

echo "local frontend full e2e passed"
