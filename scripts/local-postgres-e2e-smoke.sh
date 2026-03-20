#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${POSTGRES_SMOKE_CONTAINER_NAME:-ielts-postgres-e2e-smoke}"
HOST_PORT="${POSTGRES_HOST_PORT:-55432}"
DEFAULT_CONNECTION_STRING="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/ielts_app"
EXPLICIT_CONNECTION_STRING="${POSTGRES_CONNECTION_STRING:-}"
EXPLICIT_RELEASE_TEST_POSTGRES_URL="${RELEASE_TEST_POSTGRES_URL:-}"
CONNECTION_STRING="${EXPLICIT_CONNECTION_STRING:-${EXPLICIT_RELEASE_TEST_POSTGRES_URL:-$DEFAULT_CONNECTION_STRING}}"
START_DOCKER="${POSTGRES_SMOKE_START_DOCKER:-auto}"
RUN_SERVER_INTEGRATION="${POSTGRES_SMOKE_RUN_SERVER_INTEGRATION:-true}"
SERVER_LOG="${SERVER_LOG:-/tmp/ielts-postgres-server.log}"
SERVER_PID_FILE="${SERVER_PID_FILE:-/tmp/ielts-postgres-server.pid}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"
DOCKER_STARTED=false
START_WITH_DOCKER=false

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

should_start_docker() {
  local setting="${1:-auto}"
  case "$(echo "$setting" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y|on)
      return 0
      ;;
    0|false|no|n|off)
      return 1
      ;;
    auto)
      if [[ -n "${POSTGRES_CONNECTION_STRING:-}" || -n "${RELEASE_TEST_POSTGRES_URL:-}" ]]; then
        return 1
      fi
      return 0
      ;;
    *)
      echo "ERROR: unsupported POSTGRES_SMOKE_START_DOCKER value: $setting"
      echo "expected: auto|true|false"
      exit 1
      ;;
  esac
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $command_name"
    exit 1
  fi
}

print_external_postgres_hint() {
  echo "hint: reuse an existing Postgres with one of:"
  echo "  POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local"
  echo "  RELEASE_TEST_POSTGRES_URL=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local"
}

print_postgres_smoke_faq() {
  echo "[postgres-smoke] FAQ:"
  echo "  - default mode: no explicit connection string -> auto start local Docker/OrbStack Postgres"
  echo "  - external mode: set POSTGRES_CONNECTION_STRING or RELEASE_TEST_POSTGRES_URL and POSTGRES_SMOKE_START_DOCKER=false"
  echo "  - forced local container mode: set POSTGRES_SMOKE_START_DOCKER=true"
}

log_connection_mode() {
  local mode="$1"
  echo "[postgres-smoke] mode=${mode}"
  if [[ "$mode" == "external-postgres" ]]; then
    if [[ -n "$EXPLICIT_CONNECTION_STRING" ]]; then
      echo "[postgres-smoke] connection_source=POSTGRES_CONNECTION_STRING"
    elif [[ -n "$EXPLICIT_RELEASE_TEST_POSTGRES_URL" ]]; then
      echo "[postgres-smoke] connection_source=RELEASE_TEST_POSTGRES_URL"
    else
      echo "[postgres-smoke] connection_source=default-local"
      echo "[postgres-smoke] WARN: POSTGRES_SMOKE_START_DOCKER=false but no explicit connection string was provided."
      echo "[postgres-smoke] WARN: reusing default local connection ${CONNECTION_STRING}"
      echo "[postgres-smoke] WARN: prefer setting POSTGRES_CONNECTION_STRING explicitly to avoid targeting the wrong instance."
    fi
  fi
}

start_docker_postgres() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker CLI is not installed or not in PATH."
    print_external_postgres_hint
    print_postgres_smoke_faq
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: docker daemon is not available."
    echo "hint: start Docker/OrbStack first if you want the default local container path."
    print_external_postgres_hint
    print_postgres_smoke_faq
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

  for i in $(seq 1 60); do
    status="$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      DOCKER_STARTED=true
      return 0
    fi
    sleep 1
    if [[ "$i" -eq 60 ]]; then
      echo "postgres service not healthy in 60s"
      docker logs "$CONTAINER_NAME" || true
      exit 1
    fi
  done
}

cleanup() {
  bash scripts/ci/stop-server.sh "$SERVER_PID_FILE" || true
  if [[ "$DOCKER_STARTED" == "true" ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[postgres-smoke] connection_string=$CONNECTION_STRING"

if should_start_docker "$START_DOCKER"; then
  START_WITH_DOCKER=true
fi

if [[ "$START_WITH_DOCKER" == "true" ]]; then
  log_connection_mode "docker-managed"
  echo "[postgres-smoke] starting dockerized postgres on port ${HOST_PORT}"
  start_docker_postgres
else
  log_connection_mode "external-postgres"
  echo "[postgres-smoke] using existing postgres instance"
fi

echo "[postgres-smoke] migrating postgres schema"
npm run db:migrate:release:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:auth-account:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:learner-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:practice-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:speaking-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:writing-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public
npm run db:migrate:mock-state:postgres --workspace @ielts/server -- --connection_string="$CONNECTION_STRING" --schema=public

if is_truthy "$RUN_SERVER_INTEGRATION"; then
  echo "[postgres-smoke] running server postgres integration tests"
  RELEASE_TEST_POSTGRES_URL="$CONNECTION_STRING" npm run test:server:integration:postgres
else
  echo "[postgres-smoke] skipping server postgres integration tests"
fi

echo "[postgres-smoke] starting server with postgres backend"
AUTH_ACCOUNT_STORAGE_BACKEND=postgres \
AUTH_ACCOUNT_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
AUTH_ACCOUNT_STORAGE_SCHEMA=public \
LEARNER_STATE_STORAGE_BACKEND=postgres \
LEARNER_STATE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
LEARNER_STATE_STORAGE_SCHEMA=public \
PRACTICE_STATE_STORAGE_BACKEND=postgres \
PRACTICE_STATE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
PRACTICE_STATE_STORAGE_SCHEMA=public \
SPEAKING_STATE_STORAGE_BACKEND=postgres \
SPEAKING_STATE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
SPEAKING_STATE_STORAGE_SCHEMA=public \
WRITING_STATE_STORAGE_BACKEND=postgres \
WRITING_STATE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
WRITING_STATE_STORAGE_SCHEMA=public \
MOCK_STATE_STORAGE_BACKEND=postgres \
MOCK_STATE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
MOCK_STATE_STORAGE_SCHEMA=public \
RELEASE_STORAGE_BACKEND=postgres \
RELEASE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING" \
RELEASE_STORAGE_SCHEMA=public \
bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$SERVER_LOG" \
  --pid-file "$SERVER_PID_FILE" \
  --health-url "http://127.0.0.1:8787/health" \
  --timeout-seconds 60

echo "[postgres-smoke] running postgres-backed API smoke"
PLAYWRIGHT_API_BASE_URL="http://127.0.0.1:8787" npm run test:e2e:stability --workspace @ielts/client

echo "local postgres e2e smoke passed"
