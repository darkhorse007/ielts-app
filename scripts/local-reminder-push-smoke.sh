#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${REMINDER_PUSH_SMOKE_BACKEND_LOG:-/tmp/ielts-reminder-push-backend.log}"
BACKEND_PID_FILE="${REMINDER_PUSH_SMOKE_BACKEND_PID_FILE:-/tmp/ielts-reminder-push-backend.pid}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"
API_BASE_URL="${REMINDER_PUSH_SMOKE_API_BASE_URL:-http://127.0.0.1:8787}"
START_SERVER="${REMINDER_PUSH_SMOKE_START_SERVER:-true}"
REGISTER_EMAIL="${REMINDER_PUSH_SMOKE_EMAIL:-reminder-push-smoke-$(date +%s)@example.test}"
REGISTER_PASSWORD="${REMINDER_PUSH_SMOKE_PASSWORD:-Passw0rd!123}"
DEVICE_ID="${REMINDER_PUSH_SMOKE_DEVICE_ID:-reminder-push-smoke-cli}"
INSTALLATION_ID="${REMINDER_PUSH_SMOKE_INSTALLATION_ID:-reminder-push-smoke-$(date +%s)}"
PLATFORM="${REMINDER_PUSH_SMOKE_PLATFORM:-}"
PUSH_PROVIDER="${REMINDER_PUSH_SMOKE_PROVIDER:-}"
PUSH_TOKEN="${REMINDER_PUSH_SMOKE_PUSH_TOKEN:-}"
PUSH_ENVIRONMENT="${REMINDER_PUSH_SMOKE_ENVIRONMENT:-preview}"
DEVICE_LABEL="${REMINDER_PUSH_SMOKE_DEVICE_LABEL:-Reminder Push Smoke Device}"
APP_BUILD="${REMINDER_PUSH_SMOKE_APP_BUILD:-local-smoke}"
TARGET_OVERALL_BAND="${REMINDER_PUSH_SMOKE_TARGET_OVERALL_BAND:-6.5}"
TARGET_EXAM_DATE="${REMINDER_PUSH_SMOKE_TARGET_EXAM_DATE:-}"
WEEKLY_STUDY_HOURS="${REMINDER_PUSH_SMOKE_WEEKLY_STUDY_HOURS:-8}"
WEAK_SKILLS="${REMINDER_PUSH_SMOKE_WEAK_SKILLS:-speaking,writing}"
ANSWER_TEXT="${REMINDER_PUSH_SMOKE_ANSWER_TEXT:-Local reminder push smoke answer}"
EXPECT_PROVIDER_READY="${REMINDER_PUSH_SMOKE_EXPECT_PROVIDER_READY:-true}"

HTTP_BODY=""
HTTP_STATUS=""
STARTED_SERVER=false

log() {
  echo "[reminder-push-smoke] $1"
}

fail() {
  echo "[reminder-push-smoke] ERROR: $1" >&2
  exit 1
}

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
  if [[ "$STARTED_SERVER" == "true" ]]; then
    bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
  fi
}
trap cleanup EXIT

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "${command_name} is required"
}

json_eval() {
  local json="$1"
  local expression="$2"
  JSON_INPUT="$json" node - "$expression" <<'NODE'
const expression = process.argv[2];
const data = process.env.JSON_INPUT ? JSON.parse(process.env.JSON_INPUT) : null;
const result = Function("data", `return (${expression});`)(data);
if (typeof result === "string") {
  process.stdout.write(result);
} else if (typeof result === "number" || typeof result === "boolean") {
  process.stdout.write(String(result));
} else {
  process.stdout.write(JSON.stringify(result));
}
NODE
}

json_array_lines() {
  local json="$1"
  local expression="$2"
  JSON_INPUT="$json" node - "$expression" <<'NODE'
const expression = process.argv[2];
const data = process.env.JSON_INPUT ? JSON.parse(process.env.JSON_INPUT) : null;
const result = Function("data", `return (${expression});`)(data);
if (!Array.isArray(result)) {
  process.exit(1);
}
for (const item of result) {
  if (typeof item === "string") {
    process.stdout.write(`${item}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(item)}\n`);
  }
}
NODE
}

http_request() {
  local method="$1"
  local path="$2"
  local auth_token="${3:-}"
  local payload="${4:-__NO_PAYLOAD__}"
  local response
  local args=(
    -sS
    -X "$method"
    -H "Accept: application/json"
  )

  if [[ -n "$auth_token" ]]; then
    args+=(-H "Authorization: Bearer $auth_token")
  fi

  if [[ "$payload" != "__NO_PAYLOAD__" ]]; then
    args+=(-H "Content-Type: application/json" --data "$payload")
  fi

  response="$(curl "${args[@]}" "${API_BASE_URL}${path}" -w $'\n%{http_code}')"
  HTTP_STATUS="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
}

require_status() {
  local expected_status="$1"
  local description="$2"

  if [[ "$HTTP_STATUS" != "$expected_status" ]]; then
    echo "$HTTP_BODY" >&2
    fail "${description} failed with HTTP ${HTTP_STATUS}"
  fi
}

build_register_payload() {
  REGISTER_EMAIL="$REGISTER_EMAIL" REGISTER_PASSWORD="$REGISTER_PASSWORD" node <<'NODE'
console.log(JSON.stringify({
  email: process.env.REGISTER_EMAIL,
  password: process.env.REGISTER_PASSWORD
}));
NODE
}

build_login_payload() {
  REGISTER_EMAIL="$REGISTER_EMAIL" REGISTER_PASSWORD="$REGISTER_PASSWORD" DEVICE_ID="$DEVICE_ID" node <<'NODE'
console.log(JSON.stringify({
  identifier: process.env.REGISTER_EMAIL,
  password: process.env.REGISTER_PASSWORD,
  device_id: process.env.DEVICE_ID
}));
NODE
}

build_device_payload() {
  PLATFORM="$PLATFORM" \
  PUSH_PROVIDER="$PUSH_PROVIDER" \
  PUSH_TOKEN="$PUSH_TOKEN" \
  PUSH_ENVIRONMENT="$PUSH_ENVIRONMENT" \
  DEVICE_LABEL="$DEVICE_LABEL" \
  APP_BUILD="$APP_BUILD" \
  node <<'NODE'
console.log(JSON.stringify({
  platform: process.env.PLATFORM,
  permission_status: "granted",
  push_provider: process.env.PUSH_PROVIDER,
  push_token: process.env.PUSH_TOKEN,
  device_label: process.env.DEVICE_LABEL,
  app_build: process.env.APP_BUILD,
  environment: process.env.PUSH_ENVIRONMENT
}));
NODE
}

build_onboarding_payload() {
  TARGET_OVERALL_BAND="$TARGET_OVERALL_BAND" \
  TARGET_EXAM_DATE="$TARGET_EXAM_DATE" \
  WEEKLY_STUDY_HOURS="$WEEKLY_STUDY_HOURS" \
  WEAK_SKILLS="$WEAK_SKILLS" \
  node <<'NODE'
const weakSkills = (process.env.WEAK_SKILLS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
console.log(JSON.stringify({
  target_overall_band: Number(process.env.TARGET_OVERALL_BAND),
  target_exam_date: process.env.TARGET_EXAM_DATE,
  weekly_study_hours: Number(process.env.WEEKLY_STUDY_HOURS),
  weak_skills: weakSkills
}));
NODE
}

build_answer_payload() {
  local question_id="$1"
  QUESTION_ID="$question_id" ANSWER_TEXT="$ANSWER_TEXT" node <<'NODE'
console.log(JSON.stringify({
  question_id: process.env.QUESTION_ID,
  answer: process.env.ANSWER_TEXT
}));
NODE
}

if [[ -z "$PLATFORM" ]]; then
  fail "REMINDER_PUSH_SMOKE_PLATFORM is required (ios or android)"
fi

case "$PLATFORM" in
  ios|android) ;;
  *) fail "REMINDER_PUSH_SMOKE_PLATFORM must be ios or android" ;;
esac

if [[ -z "$PUSH_PROVIDER" ]]; then
  case "$PLATFORM" in
    ios) PUSH_PROVIDER="apns" ;;
    android) PUSH_PROVIDER="fcm" ;;
  esac
fi

case "$PUSH_PROVIDER" in
  apns|fcm) ;;
  *) fail "REMINDER_PUSH_SMOKE_PROVIDER must be apns or fcm" ;;
esac

case "$PUSH_ENVIRONMENT" in
  development|preview|production) ;;
  *) fail "REMINDER_PUSH_SMOKE_ENVIRONMENT must be development, preview, or production" ;;
esac

if [[ -z "$PUSH_TOKEN" ]]; then
  fail "REMINDER_PUSH_SMOKE_PUSH_TOKEN is required; pass a real APNs or FCM device token first"
fi

require_command curl
require_command node

if [[ -z "$TARGET_EXAM_DATE" ]]; then
  TARGET_EXAM_DATE="$(node -e 'const date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 56); console.log(date.toISOString().slice(0, 10));')"
fi

if is_truthy "$START_SERVER"; then
  require_command npm
  log "starting local server with INTERNAL_DEBUG_ROUTES_ENABLED=true"
  export AUTH_SECRET="$AUTH_SECRET_VALUE"
  export INTERNAL_DEBUG_ROUTES_ENABLED=true
  bash scripts/ci/start-server-and-wait.sh \
    --command "npm run start --workspace @ielts/server" \
    --log-file "$BACKEND_LOG" \
    --pid-file "$BACKEND_PID_FILE" \
    --health-url "$API_BASE_URL/health" \
    --timeout-seconds 60
  STARTED_SERVER=true
else
  log "using existing server at ${API_BASE_URL}"
fi

log "checking /internal/reminders/push-status"
http_request GET "/internal/reminders/push-status"
if [[ "$HTTP_STATUS" == "404" ]]; then
  fail "/internal/reminders/push-status is unavailable; enable INTERNAL_DEBUG_ROUTES_ENABLED=true on the target server"
fi
require_status "200" "fetch push runtime status"

if is_truthy "$EXPECT_PROVIDER_READY"; then
  PROVIDER_READY="$(json_eval "$HTTP_BODY" "data.reminder_push_providers.${PUSH_PROVIDER}.ready")"
  if [[ "$PROVIDER_READY" != "true" ]]; then
    PROVIDER_STATE="$(json_eval "$HTTP_BODY" "data.reminder_push_providers.${PUSH_PROVIDER}")"
    echo "$PROVIDER_STATE" >&2
    fail "${PUSH_PROVIDER} is not ready according to /internal/reminders/push-status"
  fi
fi

log "registering smoke user ${REGISTER_EMAIL}"
http_request POST "/v1/auth/register" "" "$(build_register_payload)"
require_status "201" "register smoke user"

log "logging in"
http_request POST "/v1/auth/login" "" "$(build_login_payload)"
require_status "200" "login smoke user"
ACCESS_TOKEN="$(json_eval "$HTTP_BODY" "data.access_token")"

log "registering reminder device ${INSTALLATION_ID}"
http_request PUT "/v1/reminders/devices/${INSTALLATION_ID}" "$ACCESS_TOKEN" "$(build_device_payload)"
require_status "200" "register reminder device"

log "creating onboarding assessment"
http_request POST "/v1/users/onboarding" "$ACCESS_TOKEN" "$(build_onboarding_payload)"
require_status "202" "create onboarding assessment"
ASSESSMENT_ID="$(json_eval "$HTTP_BODY" "data.assessment_id")"

log "loading diagnostic questions"
http_request GET "/v1/users/onboarding/${ASSESSMENT_ID}/questions" "$ACCESS_TOKEN"
require_status "200" "fetch diagnostic questions"

mapfile -t QUESTION_IDS < <(json_array_lines "$HTTP_BODY" "data.questions.map((item) => item.question_id)")
if [[ "${#QUESTION_IDS[@]}" -eq 0 ]]; then
  fail "diagnostic question set is empty"
fi

for QUESTION_ID in "${QUESTION_IDS[@]}"; do
  http_request POST "/v1/users/onboarding/${ASSESSMENT_ID}/answers" "$ACCESS_TOKEN" "$(build_answer_payload "$QUESTION_ID")"
  require_status "200" "submit diagnostic answer"
done

log "completing diagnostic"
http_request POST "/v1/users/onboarding/${ASSESSMENT_ID}/complete" "$ACCESS_TOKEN"
require_status "200" "complete diagnostic"
PLAN_ID="$(json_eval "$HTTP_BODY" "data.plan_id")"

log "loading active plan"
http_request GET "/v1/users/plans/active" "$ACCESS_TOKEN"
require_status "200" "fetch active plan"
ACTIVE_PLAN_ID="$(json_eval "$HTTP_BODY" "data.plan_id")"
if [[ "$ACTIVE_PLAN_ID" != "$PLAN_ID" ]]; then
  fail "active plan ${ACTIVE_PLAN_ID} does not match onboarding plan ${PLAN_ID}"
fi

log "creating reminder recommendation"
http_request GET "/v1/reminders/recommendation" "$ACCESS_TOKEN"
require_status "200" "create reminder recommendation"
REMINDER_ID="$(json_eval "$HTTP_BODY" "data.reminder_id")"

log "previewing reminder dispatch"
http_request POST "/v1/reminders/${REMINDER_ID}/dispatch-preview" "$ACCESS_TOKEN"
require_status "200" "preview reminder dispatch"
PREVIEW_DISPATCHABLE_COUNT="$(json_eval "$HTTP_BODY" "data.dispatchable_count")"
if [[ "$PREVIEW_DISPATCHABLE_COUNT" -lt 1 ]]; then
  echo "$HTTP_BODY" >&2
  fail "dispatch preview shows no dispatchable devices"
fi

log "re-checking provider/device aggregation"
http_request GET "/internal/reminders/push-status"
require_status "200" "re-fetch push runtime status"
REGISTERED_DEVICE_COUNT="$(json_eval "$HTTP_BODY" "data.reminder_push_providers.${PUSH_PROVIDER}.registered_device_count")"
if [[ "$REGISTERED_DEVICE_COUNT" -lt 1 ]]; then
  echo "$HTTP_BODY" >&2
  fail "${PUSH_PROVIDER} registered_device_count did not increase"
fi

log "dispatching reminder through ${PUSH_PROVIDER}"
http_request POST "/v1/reminders/${REMINDER_ID}/dispatch" "$ACCESS_TOKEN"
require_status "200" "dispatch reminder"
DISPATCH_COUNT="$(json_eval "$HTTP_BODY" "data.dispatch_count")"
FAILED_COUNT="$(json_eval "$HTTP_BODY" "data.failed_count")"
FIRST_ITEM_STATUS="$(json_eval "$HTTP_BODY" 'data.items[0]?.status ?? ""')"
PROVIDER_MESSAGE_ID="$(json_eval "$HTTP_BODY" 'data.items[0]?.provider_message_id ?? ""')"
FAILURE_CODE="$(json_eval "$HTTP_BODY" 'data.items[0]?.failure_code ?? ""')"
FAILURE_MESSAGE="$(json_eval "$HTTP_BODY" 'data.items[0]?.failure_message ?? ""')"

if [[ "$DISPATCH_COUNT" -lt 1 || "$FAILED_COUNT" -ne 0 || "$FIRST_ITEM_STATUS" != "sent" ]]; then
  echo "$HTTP_BODY" >&2
  fail "provider dispatch was not accepted"
fi

log "loading device list for latest attempt"
http_request GET "/v1/reminders/devices" "$ACCESS_TOKEN"
require_status "200" "fetch reminder devices"

cat <<EOF
local reminder push smoke passed
provider: ${PUSH_PROVIDER}
platform: ${PLATFORM}
environment: ${PUSH_ENVIRONMENT}
api_base_url: ${API_BASE_URL}
user_email: ${REGISTER_EMAIL}
installation_id: ${INSTALLATION_ID}
plan_id: ${PLAN_ID}
reminder_id: ${REMINDER_ID}
dispatch_status: ${FIRST_ITEM_STATUS}
provider_message_id: ${PROVIDER_MESSAGE_ID}
failure_code: ${FAILURE_CODE}
failure_message: ${FAILURE_MESSAGE}

Next check on device:
1. Confirm the notification actually appears on the target device.
2. Tap it and verify the app restores the reminder deep link.
3. If the device did not receive anything, inspect GET /internal/reminders/push-status and GET /v1/reminders/devices for the same smoke account.
EOF
