#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${POSTGRES_CHAOS_CONTAINER_NAME:-ielts-postgres-chaos-drill}"
HOST_PORT="${POSTGRES_CHAOS_HOST_PORT:-55434}"
CONNECTION_STRING="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/ielts_app"
SERVER_LOG="${POSTGRES_CHAOS_SERVER_LOG:-/tmp/ielts-postgres-chaos-server.log}"
SERVER_PID_FILE="${POSTGRES_CHAOS_SERVER_PID_FILE:-/tmp/ielts-postgres-chaos-server.pid}"
REPORT_PATH="${POSTGRES_CHAOS_REPORT_PATH:-artifacts/postgres-chaos-drill-report.json}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"

cleanup() {
  bash scripts/ci/stop-server.sh "$SERVER_PID_FILE" || true
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

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

for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)
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

RELEASE_STORAGE_BACKEND=postgres \
RELEASE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
RELEASE_STORAGE_SCHEMA=public \
RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS="3" \
RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD="3" \
RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS="1000" \
SYSTEM_RBAC_ENFORCED="false" \
bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$SERVER_LOG" \
  --pid-file "$SERVER_PID_FILE" \
  --health-url "http://127.0.0.1:8787/health" \
  --timeout-seconds 60

npm run drill:postgres-chaos --workspace @ielts/server -- \
  --base_url=http://127.0.0.1:8787 \
  --pg_container="$CONTAINER_NAME" \
  --output="$REPORT_PATH"

echo "local postgres chaos drill passed"
