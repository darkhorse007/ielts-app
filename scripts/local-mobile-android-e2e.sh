#!/usr/bin/env bash
set -euo pipefail

BACKEND_LOG="${MOBILE_ANDROID_E2E_BACKEND_LOG:-/tmp/ielts-mobile-android-backend.log}"
BACKEND_PID_FILE="${MOBILE_ANDROID_E2E_BACKEND_PID_FILE:-/tmp/ielts-mobile-android-backend.pid}"
METRO_LOG="${MOBILE_ANDROID_E2E_METRO_LOG:-/tmp/ielts-mobile-android-metro.log}"
METRO_PID_FILE="${MOBILE_ANDROID_E2E_METRO_PID_FILE:-/tmp/ielts-mobile-android-metro.pid}"
EMULATOR_LOG="${MOBILE_ANDROID_E2E_EMULATOR_LOG:-/tmp/ielts-mobile-android-emulator.log}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-local-auth-secret-for-smoke-and-e2e-00000001}"
API_BASE_URL="${MOBILE_ANDROID_E2E_API_BASE_URL:-http://127.0.0.1:8787}"
WS_BASE_URL="${MOBILE_ANDROID_E2E_WS_BASE_URL:-ws://127.0.0.1:8787}"
METRO_HOST="${MOBILE_ANDROID_E2E_METRO_HOST:-127.0.0.1}"
METRO_PORT="${MOBILE_ANDROID_E2E_METRO_PORT:-8081}"
METRO_HEALTH_URL="${MOBILE_ANDROID_E2E_METRO_HEALTH_URL:-http://${METRO_HOST}:${METRO_PORT}/status}"
APP_URL="${MOBILE_ANDROID_E2E_APP_URL:-exp://${METRO_HOST}:${METRO_PORT}}"
FLOW_FILE="${MOBILE_ANDROID_E2E_FLOW_FILE:-}"
REGISTER_EMAIL="${MOBILE_ANDROID_E2E_REGISTER_EMAIL:-mobile-smoke-android-$(date +%s)@example.test}"
REGISTER_PASSWORD="${MOBILE_ANDROID_E2E_REGISTER_PASSWORD:-Passw0rd!123}"
AUTO_INSTALL_MAESTRO="${MOBILE_ANDROID_E2E_AUTO_INSTALL_MAESTRO:-true}"
AUTO_START_AVD="${MOBILE_ANDROID_E2E_AUTO_START_AVD:-true}"
AUTO_INSTALL_EXPO_GO="${MOBILE_ANDROID_E2E_AUTO_INSTALL_EXPO_GO:-true}"
DEVICE_SERIAL="${MOBILE_ANDROID_E2E_DEVICE_SERIAL:-}"
AVD_NAME="${MOBILE_ANDROID_E2E_AVD_NAME:-}"
EXPO_GO_PACKAGE="${MOBILE_ANDROID_E2E_EXPO_GO_PACKAGE:-host.exp.exponent}"
DEVICE_WAIT_SECONDS="${MOBILE_ANDROID_E2E_DEVICE_WAIT_SECONDS:-120}"
EXPO_GO_WAIT_SECONDS="${MOBILE_ANDROID_E2E_EXPO_GO_WAIT_SECONDS:-60}"
FLOW_RETRY_COUNT="${MOBILE_ANDROID_E2E_FLOW_RETRY_COUNT:-2}"
ANDROID_SDK_ROOT_VALUE="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
ADB_BIN="${MOBILE_ANDROID_E2E_ADB_BIN:-}"
EMULATOR_BIN="${MOBILE_ANDROID_E2E_EMULATOR_BIN:-}"
REVERSE_PORTS=()

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
  if [[ -n "${DEVICE_SERIAL:-}" && -x "${ADB_BIN:-}" ]]; then
    local port
    if [[ ${#REVERSE_PORTS[@]} -gt 0 ]]; then
      for port in "${REVERSE_PORTS[@]}"; do
        "$ADB_BIN" -s "$DEVICE_SERIAL" reverse --remove "tcp:$port" >/dev/null 2>&1 || true
      done
    fi
  fi

  bash scripts/ci/stop-server.sh "$METRO_PID_FILE" || true
  bash scripts/ci/stop-server.sh "$BACKEND_PID_FILE" || true
}
trap cleanup EXIT

resolve_android_sdk_root() {
  local candidate

  for candidate in \
    "$ANDROID_SDK_ROOT_VALUE" \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk"
  do
    if [[ -n "$candidate" && -d "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

list_connected_devices() {
  "$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" { print $1 }'
}

pick_device_serial() {
  local first_device=""
  local emulator_device=""
  local device=""

  if [[ -n "$DEVICE_SERIAL" ]]; then
    echo "$DEVICE_SERIAL"
    return 0
  fi

  while IFS= read -r device; do
    [[ -n "$device" ]] || continue
    if [[ -z "$first_device" ]]; then
      first_device="$device"
    fi
    case "$device" in
      emulator-*)
        emulator_device="$device"
        break
        ;;
    esac
  done < <(list_connected_devices)

  if [[ -n "$emulator_device" ]]; then
    echo "$emulator_device"
    return 0
  fi

  if [[ -n "$first_device" ]]; then
    echo "$first_device"
    return 0
  fi

  return 1
}

resolve_default_avd_name() {
  local avd=""

  if [[ -n "$AVD_NAME" ]]; then
    echo "$AVD_NAME"
    return 0
  fi

  if [[ ! -x "$EMULATOR_BIN" ]]; then
    return 1
  fi

  while IFS= read -r avd; do
    case "$avd" in
      Pixel_*)
        echo "$avd"
        return 0
        ;;
    esac
  done < <("$EMULATOR_BIN" -list-avds)

  "$EMULATOR_BIN" -list-avds | awk 'NR == 1 { print; exit }'
}

wait_for_device_serial() {
  local attempts
  attempts=$((DEVICE_WAIT_SECONDS / 2))
  if [[ "$attempts" -lt 1 ]]; then
    attempts=1
  fi

  while [[ "$attempts" -gt 0 ]]; do
    if DEVICE_SERIAL="$(pick_device_serial)"; then
      export DEVICE_SERIAL
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done

  return 1
}

wait_for_android_boot() {
  local boot_completed=""
  local device_state=""
  local attempts
  attempts=$((DEVICE_WAIT_SECONDS / 2))
  if [[ "$attempts" -lt 1 ]]; then
    attempts=1
  fi

  while [[ "$attempts" -gt 0 ]]; do
    device_state="$("$ADB_BIN" -s "$DEVICE_SERIAL" get-state 2>/dev/null | tr -d '\r' || true)"
    if [[ "$device_state" == "device" ]]; then
      boot_completed="$("$ADB_BIN" -s "$DEVICE_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    else
      boot_completed=""
    fi

    if [[ "$boot_completed" == "1" ]]; then
      "$ADB_BIN" -s "$DEVICE_SERIAL" shell input keyevent 82 >/dev/null 2>&1 || true
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done

  echo "android device ${DEVICE_SERIAL} did not finish booting within ${DEVICE_WAIT_SECONDS}s" >&2
  return 1
}

start_avd_if_needed() {
  local resolved_avd=""

  if DEVICE_SERIAL="$(pick_device_serial)"; then
    export DEVICE_SERIAL
    return 0
  fi

  if ! is_truthy "$AUTO_START_AVD"; then
    echo "no Android device detected; connect a device or set MOBILE_ANDROID_E2E_AUTO_START_AVD=true" >&2
    exit 1
  fi

  if [[ ! -x "$EMULATOR_BIN" ]]; then
    echo "Android emulator binary not found; set MOBILE_ANDROID_E2E_EMULATOR_BIN or install Android SDK emulator" >&2
    exit 1
  fi

  resolved_avd="$(resolve_default_avd_name)"
  if [[ -z "$resolved_avd" ]]; then
    echo "no Android AVD found; create one in Android Studio or set MOBILE_ANDROID_E2E_AVD_NAME" >&2
    exit 1
  fi

  echo "starting Android emulator: ${resolved_avd}"
  nohup "$EMULATOR_BIN" -avd "$resolved_avd" -no-snapshot-save -netdelay none -netspeed full >"$EMULATOR_LOG" 2>&1 &

  if ! wait_for_device_serial; then
    echo "Android emulator did not register with adb within ${DEVICE_WAIT_SECONDS}s" >&2
    echo "Emulator log: $EMULATOR_LOG" >&2
    exit 1
  fi
}

get_url_port() {
  node -e 'const url = new URL(process.argv[1]); console.log(url.port || ((url.protocol === "https:" || url.protocol === "wss:") ? 443 : 80));' "$1"
}

is_loopback_url() {
  case "$1" in
    http://127.0.0.1*|http://localhost*|https://127.0.0.1*|https://localhost*|ws://127.0.0.1*|ws://localhost*|wss://127.0.0.1*|wss://localhost*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

add_reverse_port() {
  local port="$1"
  local existing=""

  if [[ ${#REVERSE_PORTS[@]} -gt 0 ]]; then
    for existing in "${REVERSE_PORTS[@]}"; do
      if [[ "$existing" == "$port" ]]; then
        return 0
      fi
    done
  fi

  REVERSE_PORTS+=("$port")
}

wait_for_expo_go() {
  local attempts
  attempts=$((EXPO_GO_WAIT_SECONDS / 2))
  if [[ "$attempts" -lt 1 ]]; then
    attempts=1
  fi

  while [[ "$attempts" -gt 0 ]]; do
    if "$ADB_BIN" -s "$DEVICE_SERIAL" shell pm list packages | tr -d '\r' | grep -q "^package:${EXPO_GO_PACKAGE}$"; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done

  return 1
}

launch_expo_go_app() {
  "$ADB_BIN" -s "$DEVICE_SERIAL" shell pm clear "$EXPO_GO_PACKAGE" >/dev/null 2>&1 || true

  if is_truthy "$AUTO_INSTALL_EXPO_GO"; then
    DEVICE_SERIAL="$DEVICE_SERIAL" \
    APP_URL="$APP_URL" \
    EXPO_GO_PACKAGE="$EXPO_GO_PACKAGE" \
    EXPO_PROJECT_ROOT="$PWD/apps/mobile" \
    node scripts/ci/ensure-android-expo-go.cjs
    return 0
  fi

  if ! wait_for_expo_go; then
    echo "Expo Go package ${EXPO_GO_PACKAGE} was not detected on Android device ${DEVICE_SERIAL} within ${EXPO_GO_WAIT_SECONDS}s" >&2
    echo "Metro log: $METRO_LOG" >&2
    exit 1
  fi

  "$ADB_BIN" -s "$DEVICE_SERIAL" shell am start -W -a android.intent.action.VIEW -d "$APP_URL" "$EXPO_GO_PACKAGE" >/dev/null
}

export PATH="$HOME/.maestro/bin:$PATH"

if [[ "${JAVA_TOOL_OPTIONS:-}" != *"-Djdk.lang.Process.launchMechanism=FORK"* ]]; then
  if [[ -n "${JAVA_TOOL_OPTIONS:-}" ]]; then
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS} -Djdk.lang.Process.launchMechanism=FORK"
  else
    export JAVA_TOOL_OPTIONS="-Djdk.lang.Process.launchMechanism=FORK"
  fi
fi

if ANDROID_SDK_ROOT_VALUE="$(resolve_android_sdk_root)"; then
  export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT_VALUE"
  export ANDROID_HOME="$ANDROID_SDK_ROOT_VALUE"
fi

if [[ -z "$ADB_BIN" && -n "${ANDROID_SDK_ROOT_VALUE:-}" && -x "${ANDROID_SDK_ROOT_VALUE}/platform-tools/adb" ]]; then
  ADB_BIN="${ANDROID_SDK_ROOT_VALUE}/platform-tools/adb"
fi

if [[ -z "$EMULATOR_BIN" && -n "${ANDROID_SDK_ROOT_VALUE:-}" && -x "${ANDROID_SDK_ROOT_VALUE}/emulator/emulator" ]]; then
  EMULATOR_BIN="${ANDROID_SDK_ROOT_VALUE}/emulator/emulator"
fi

if [[ -z "$ADB_BIN" ]] && command -v adb >/dev/null 2>&1; then
  ADB_BIN="$(command -v adb)"
fi

if [[ -z "$EMULATOR_BIN" ]] && command -v emulator >/dev/null 2>&1; then
  EMULATOR_BIN="$(command -v emulator)"
fi

if [[ -z "$ADB_BIN" || -z "$EMULATOR_BIN" ]]; then
  if [[ -z "$ADB_BIN" ]]; then
    echo "Android SDK root was not found; set ANDROID_SDK_ROOT/ANDROID_HOME or MOBILE_ANDROID_E2E_ADB_BIN" >&2
    exit 1
  fi
fi

if [[ -z "$ADB_BIN" ]]; then
  ADB_BIN="${ANDROID_SDK_ROOT_VALUE}/platform-tools/adb"
fi

if [[ -z "$EMULATOR_BIN" ]]; then
  EMULATOR_BIN="${ANDROID_SDK_ROOT_VALUE}/emulator/emulator"
fi

if [[ ! -x "$ADB_BIN" ]]; then
  echo "adb is required; set MOBILE_ANDROID_E2E_ADB_BIN or install Android SDK platform-tools" >&2
  exit 1
fi

if is_truthy "$AUTO_INSTALL_MAESTRO"; then
  bash scripts/ci/install-maestro.sh
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro is required; install it or set MOBILE_ANDROID_E2E_AUTO_INSTALL_MAESTRO=true" >&2
  exit 1
fi

start_avd_if_needed
wait_for_android_boot

if is_loopback_url "$API_BASE_URL"; then
  add_reverse_port "$(get_url_port "$API_BASE_URL")"
fi

if is_loopback_url "$WS_BASE_URL"; then
  add_reverse_port "$(get_url_port "$WS_BASE_URL")"
fi

add_reverse_port "$METRO_PORT"

for port in "${REVERSE_PORTS[@]}"; do
  "$ADB_BIN" -s "$DEVICE_SERIAL" reverse "tcp:$port" "tcp:$port"
done

bash scripts/ci/start-server-and-wait.sh \
  --command "AUTH_SECRET=$AUTH_SECRET_VALUE npm run start --workspace @ielts/server" \
  --log-file "$BACKEND_LOG" \
  --pid-file "$BACKEND_PID_FILE" \
  --health-url "$API_BASE_URL/health" \
  --timeout-seconds 60

bash scripts/ci/start-server-and-wait.sh \
  --command "CI=1 REACT_NATIVE_PACKAGER_HOSTNAME=$METRO_HOST EXPO_PUBLIC_API_BASE_URL=$API_BASE_URL EXPO_PUBLIC_WS_BASE_URL=$WS_BASE_URL EXPO_PUBLIC_E2E_PLAINTEXT_PASSWORD_FIELDS=true EXPO_PUBLIC_E2E_REMINDER_NOTIFICATION_HARNESS=true npm exec --workspace @ielts/mobile -- expo start -- --port $METRO_PORT" \
  --log-file "$METRO_LOG" \
  --pid-file "$METRO_PID_FILE" \
  --health-url "$METRO_HEALTH_URL" \
  --timeout-seconds 120

run_maestro_flow() {
  local flow_file="$1"
  local register_email="$2"
  local attempt=1
  local flow_register_email=""

  while [[ "$attempt" -le "$FLOW_RETRY_COUNT" ]]; do
    if [[ "$attempt" -eq 1 ]]; then
      flow_register_email="$register_email"
    else
      flow_register_email="${register_email%@*}+retry${attempt}@${register_email#*@}"
    fi

    launch_expo_go_app
    if maestro --platform=android --device="$DEVICE_SERIAL" test "$flow_file" \
      -e APP_URL="$APP_URL" \
      -e REGISTER_EMAIL="$flow_register_email" \
      -e REGISTER_PASSWORD="$REGISTER_PASSWORD"; then
      return 0
    fi

    if [[ "$attempt" -ge "$FLOW_RETRY_COUNT" ]]; then
      return 1
    fi

    echo "Android maestro flow failed on attempt ${attempt}/${FLOW_RETRY_COUNT}; retrying ${flow_file}" >&2
    attempt=$((attempt + 1))
    sleep 3
  done
}

if [[ -n "$FLOW_FILE" ]]; then
  run_maestro_flow "$FLOW_FILE" "$REGISTER_EMAIL"
else
  FLOW_FILES=(
    "apps/mobile/e2e/maestro/android-mock-exam-smoke.yaml"
    "apps/mobile/e2e/maestro/android-reminder-notification-smoke.yaml"
    "apps/mobile/e2e/maestro/android-account-smoke.yaml"
  )
  RUN_ID="$(date +%s)"
  FLOW_INDEX=1

  for FLOW in "${FLOW_FILES[@]}"; do
    run_maestro_flow "$FLOW" "mobile-smoke-android-${RUN_ID}-${FLOW_INDEX}@example.test"
    FLOW_INDEX=$((FLOW_INDEX + 1))
  done
fi

echo "local mobile android e2e passed"
