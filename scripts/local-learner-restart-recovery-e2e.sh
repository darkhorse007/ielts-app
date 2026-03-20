#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${BACKEND_LOG:-/tmp/ielts-learner-restart-backend.log}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/ielts-learner-restart-backend.pid}"
FRONTEND_LOG="${FRONTEND_LOG:-/tmp/ielts-learner-restart-frontend.log}"
FRONTEND_PID_FILE="${FRONTEND_PID_FILE:-/tmp/ielts-learner-restart-frontend.pid}"
CONTAINER_NAME="${LEARNER_RESTART_POSTGRES_CONTAINER_NAME:-ielts-learner-restart-postgres}"
HOST_PORT="${LEARNER_RESTART_POSTGRES_HOST_PORT:-55432}"
CONNECTION_STRING="${POSTGRES_CONNECTION_STRING:-postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/ielts_app}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"
DOCKER_STARTED=false

cleanup() {
  bash scripts/ci/stop-server.sh "$FRONTEND_PID_FILE" || true
  bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
  if [[ "$DOCKER_STARTED" == "true" ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon is not available."
  echo "hint: start Docker/OrbStack first."
  exit 1
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ielts_app \
  -p "${HOST_PORT}:5432" \
  --health-cmd "pg_isready -U postgres -d ielts_app" \
  --health-interval 5s \
  --health-timeout 5s \
  --health-retries 20 \
  postgres:16 >/dev/null
DOCKER_STARTED=true

for i in $(seq 1 60); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "postgres service not healthy in 60s"
    docker logs "$CONTAINER_NAME" || true
    exit 1
  fi
done

npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:auth-account:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:learner-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public

echo "[learner-restart-smoke] running postgres integration tests"
RELEASE_TEST_POSTGRES_URL="$CONNECTION_STRING" npm run test:server:integration:postgres

BACKEND_COMMAND="AUTH_SECRET=$AUTH_SECRET_VALUE AUTH_ACCOUNT_STORAGE_BACKEND=postgres AUTH_ACCOUNT_STORAGE_CONNECTION_STRING=$CONNECTION_STRING AUTH_ACCOUNT_STORAGE_SCHEMA=public LEARNER_STATE_STORAGE_BACKEND=postgres LEARNER_STATE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING LEARNER_STATE_STORAGE_SCHEMA=public RELEASE_STORAGE_BACKEND=postgres RELEASE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING RELEASE_STORAGE_SCHEMA=public npm run start --workspace @ielts/server"

bash scripts/ci/start-server-and-wait.sh \
  --command "$BACKEND_COMMAND" \
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
npm run test:e2e:learner --workspace @ielts/client

echo "local learner restart recovery e2e passed"
