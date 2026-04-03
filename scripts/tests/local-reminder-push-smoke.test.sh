#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/local-reminder-push-smoke.sh"

fail() {
  echo "[local-reminder-push-smoke-test] FAIL: $1" >&2
  exit 1
}

build_fake_curl_provider_not_ready() {
  local temp_bin_dir="$1"
  cat > "$temp_bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

full_args="$*"
for arg in "$@"; do
  if [[ "$arg" == *"/internal/reminders/push-status" ]]; then
    printf '%s\n%s' \
      '{"reminder_push_providers":{"apns":{"enabled":true,"configured":false,"ready":false,"missing_fields":["private_key"]},"fcm":{"enabled":true,"configured":true,"ready":true,"missing_fields":[]}}}' \
      '200'
    exit 0
  fi
done

echo "unexpected curl invocation: ${full_args}" >&2
exit 1
EOF
  chmod +x "$temp_bin_dir/curl"
}

test_requires_push_token() {
  local output rc

  set +e
  output="$(
    REMINDER_PUSH_SMOKE_START_SERVER=false \
    REMINDER_PUSH_SMOKE_PLATFORM=ios \
    /bin/bash "$TARGET_SCRIPT" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when push token is missing"
  [[ "$output" == *"REMINDER_PUSH_SMOKE_PUSH_TOKEN is required"* ]] || fail "missing push token error"
}

test_provider_not_ready_shows_explicit_error() {
  local temp_dir output rc
  temp_dir="$(mktemp -d)"
  build_fake_curl_provider_not_ready "$temp_dir"

  set +e
  output="$(
    PATH="$temp_dir:$PATH" \
    REMINDER_PUSH_SMOKE_START_SERVER=false \
    REMINDER_PUSH_SMOKE_PLATFORM=ios \
    REMINDER_PUSH_SMOKE_PROVIDER=apns \
    REMINDER_PUSH_SMOKE_PUSH_TOKEN=native-token-abcdef1234567890 \
    /bin/bash "$TARGET_SCRIPT" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when provider is not ready"
  [[ "$output" == *"apns is not ready according to /internal/reminders/push-status"* ]] || fail "missing provider readiness error"
  [[ "$output" == *'"missing_fields":["private_key"]'* ]] || fail "missing provider state payload"
  rm -rf "$temp_dir"
}

test_requires_push_token
test_provider_not_ready_shows_explicit_error

echo "[local-reminder-push-smoke-test] PASS"
