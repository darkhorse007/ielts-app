#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${MOBILE_IOS_E2E_BACKEND_LOG:-/tmp/ielts-mobile-ios-backend.log}"
BACKEND_PID_FILE="${MOBILE_IOS_E2E_BACKEND_PID_FILE:-/tmp/ielts-mobile-ios-backend.pid}"
METRO_LOG="${MOBILE_IOS_E2E_METRO_LOG:-/tmp/ielts-mobile-ios-metro.log}"
METRO_PID_FILE="${MOBILE_IOS_E2E_METRO_PID_FILE:-/tmp/ielts-mobile-ios-metro.pid}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"
API_BASE_URL="${MOBILE_IOS_E2E_API_BASE_URL:-http://127.0.0.1:8787}"
WS_BASE_URL="${MOBILE_IOS_E2E_WS_BASE_URL:-ws://127.0.0.1:8787}"
METRO_HOST="${MOBILE_IOS_E2E_METRO_HOST:-127.0.0.1}"
METRO_PORT="${MOBILE_IOS_E2E_METRO_PORT:-8081}"
METRO_HEALTH_URL="${MOBILE_IOS_E2E_METRO_HEALTH_URL:-http://${METRO_HOST}:${METRO_PORT}/status}"
APP_URL="${MOBILE_IOS_E2E_APP_URL:-exp://${METRO_HOST}:${METRO_PORT}}"
SIMULATOR_NAME="${MOBILE_IOS_E2E_SIMULATOR_NAME:-iPhone 16 Pro}"
SIMULATOR_UDID="${MOBILE_IOS_E2E_SIMULATOR_UDID:-}"
FLOW_FILE="${MOBILE_IOS_E2E_FLOW_FILE:-}"
REGISTER_EMAIL="${MOBILE_IOS_E2E_REGISTER_EMAIL:-mobile-smoke-$(date +%s)@example.test}"
REGISTER_PASSWORD="${MOBILE_IOS_E2E_REGISTER_PASSWORD:-Passw0rd!123}"
AUTO_INSTALL_MAESTRO="${MOBILE_IOS_E2E_AUTO_INSTALL_MAESTRO:-true}"
AUTO_INSTALL_EXPO_GO="${MOBILE_IOS_E2E_AUTO_INSTALL_EXPO_GO:-true}"
EXPO_GO_WAIT_SECONDS="${MOBILE_IOS_E2E_EXPO_GO_WAIT_SECONDS:-60}"
EXPO_GO_BUNDLE_ID="${MOBILE_IOS_E2E_EXPO_GO_BUNDLE_ID:-host.exp.Exponent}"
FLOW_RETRY_COUNT="${MOBILE_IOS_E2E_FLOW_RETRY_COUNT:-2}"

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
  bash scripts/ci/stop-server.sh "$METRO_PID_FILE" || true
  bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
}
trap cleanup EXIT

resolve_simulator_name() {
  local udid="$1"
  xcrun simctl list devices | awk -v udid="$udid" -F '[()]' '$2 == udid { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1; exit }'
}

export PATH="$HOME/.maestro/bin:$PATH"

if [[ "${JAVA_TOOL_OPTIONS:-}" != *"-Djdk.lang.Process.launchMechanism=FORK"* ]]; then
  if [[ -n "${JAVA_TOOL_OPTIONS:-}" ]]; then
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS} -Djdk.lang.Process.launchMechanism=FORK"
  else
    export JAVA_TOOL_OPTIONS="-Djdk.lang.Process.launchMechanism=FORK"
  fi
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required for iOS simulator smoke" >&2
  exit 1
fi

if is_truthy "$AUTO_INSTALL_MAESTRO"; then
  bash scripts/ci/install-maestro.sh
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro is required; install it or set MOBILE_IOS_E2E_AUTO_INSTALL_MAESTRO=true" >&2
  exit 1
fi

if [[ -n "$SIMULATOR_UDID" ]]; then
  if ! xcrun simctl list devices | grep -q "$SIMULATOR_UDID) (Booted)"; then
    xcrun simctl boot "$SIMULATOR_UDID"
  fi
else
  if ! xcrun simctl list devices booted | grep -q "Booted"; then
    xcrun simctl boot "$SIMULATOR_NAME"
  fi
fi

if [[ -n "$SIMULATOR_UDID" ]]; then
  xcrun simctl bootstatus "$SIMULATOR_UDID" -b
else
  xcrun simctl bootstatus booted -b
fi

if [[ -z "$SIMULATOR_UDID" ]]; then
  SIMULATOR_UDID="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/ { print $2; exit }')"
fi

if [[ -z "$SIMULATOR_UDID" ]]; then
  echo "failed to resolve a booted iOS simulator UDID" >&2
  exit 1
fi

RESOLVED_SIMULATOR_NAME="$(resolve_simulator_name "$SIMULATOR_UDID")"
if [[ -n "$RESOLVED_SIMULATOR_NAME" ]]; then
  SIMULATOR_NAME="$RESOLVED_SIMULATOR_NAME"
fi

bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$BACKEND_LOG" \
  --pid-file "$BACKEND_PID_FILE" \
  --health-url "$API_BASE_URL/health" \
  --timeout-seconds 60

bash scripts/ci/start-server-and-wait.sh \
  --command "CI=1 REACT_NATIVE_PACKAGER_HOSTNAME=$METRO_HOST EXPO_PUBLIC_API_BASE_URL=$API_BASE_URL EXPO_PUBLIC_WS_BASE_URL=$WS_BASE_URL EXPO_PUBLIC_E2E_PLAINTEXT_PASSWORD_FIELDS=true npm exec --workspace @ielts/mobile -- expo start -- --port $METRO_PORT" \
  --log-file "$METRO_LOG" \
  --pid-file "$METRO_PID_FILE" \
  --health-url "$METRO_HEALTH_URL" \
  --timeout-seconds 120

for _ in $(seq 1 "$EXPO_GO_WAIT_SECONDS"); do
  if xcrun simctl listapps booted | rg -q "$EXPO_GO_BUNDLE_ID|Exponent"; then
    break
  fi
  if is_truthy "$AUTO_INSTALL_EXPO_GO"; then
    break
  fi
  sleep 1
done

if is_truthy "$AUTO_INSTALL_EXPO_GO"; then
  SIMULATOR_UDID="$SIMULATOR_UDID" \
  SIMULATOR_NAME="$SIMULATOR_NAME" \
  EXPO_GO_BUNDLE_ID="$EXPO_GO_BUNDLE_ID" \
  EXPO_PROJECT_ROOT="$PWD/apps/mobile" \
  node scripts/ci/ensure-ios-expo-go.cjs
else
  if ! xcrun simctl listapps booted | rg -q "$EXPO_GO_BUNDLE_ID|Exponent"; then
    echo "Expo Go was not detected on the booted simulator within ${EXPO_GO_WAIT_SECONDS}s" >&2
    echo "Install Expo Go on the simulator first, then rerun this script." >&2
    exit 1
  fi
fi

run_maestro_flow() {
  local flow_file="$1"
  local register_email="$2"
  local attempt=1

  while [[ "$attempt" -le "$FLOW_RETRY_COUNT" ]]; do
    if maestro --platform=ios --udid="$SIMULATOR_UDID" test "$flow_file" \
      -e APP_URL="$APP_URL" \
      -e REGISTER_EMAIL="$register_email" \
      -e REGISTER_PASSWORD="$REGISTER_PASSWORD"; then
      return 0
    fi

    if [[ "$attempt" -ge "$FLOW_RETRY_COUNT" ]]; then
      return 1
    fi

    echo "iOS maestro flow failed on attempt ${attempt}/${FLOW_RETRY_COUNT}; retrying ${flow_file}" >&2
    attempt=$((attempt + 1))
    sleep 3
  done
}

if [[ -n "$FLOW_FILE" ]]; then
  run_maestro_flow "$FLOW_FILE" "$REGISTER_EMAIL"
else
  FLOW_FILES=(
    "apps/mobile/e2e/maestro/ios-mock-exam-smoke.yaml"
    "apps/mobile/e2e/maestro/ios-account-smoke.yaml"
  )
  RUN_ID="$(date +%s)"
  FLOW_INDEX=1

  for FLOW in "${FLOW_FILES[@]}"; do
    run_maestro_flow "$FLOW" "mobile-smoke-ios-${RUN_ID}-${FLOW_INDEX}@example.test"
    FLOW_INDEX=$((FLOW_INDEX + 1))
  done
fi

echo "local mobile ios e2e passed"
