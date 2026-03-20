#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/local-postgres-e2e-smoke.sh"

fail() {
  echo "[local-postgres-e2e-smoke-test] FAIL: $1" >&2
  exit 1
}

build_fake_docker_missing_daemon() {
  local temp_bin_dir="$1"
  cat > "$temp_bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "info" ]]; then
  exit 1
fi

echo "unexpected docker invocation: $*" >&2
exit 1
EOF
  chmod +x "$temp_bin_dir/docker"
}

test_missing_docker_cli_shows_faq() {
  local temp_dir output rc
  temp_dir="$(mktemp -d)"

  set +e
  output="$(
    PATH="$temp_dir:/usr/bin:/bin" \
    POSTGRES_SMOKE_START_DOCKER=true \
    /bin/bash "$TARGET_SCRIPT" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when docker CLI is missing"
  [[ "$output" == *"ERROR: docker CLI is not installed or not in PATH."* ]] || fail "missing docker CLI error"
  [[ "$output" == *"POSTGRES_CONNECTION_STRING=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local"* ]] || fail "missing external postgres fallback hint"
  [[ "$output" == *"[postgres-smoke] FAQ:"* ]] || fail "missing FAQ output"
  rm -rf "$temp_dir"
}

test_missing_daemon_shows_faq() {
  local temp_dir output rc
  temp_dir="$(mktemp -d)"
  build_fake_docker_missing_daemon "$temp_dir"

  set +e
  output="$(
    PATH="$temp_dir:/usr/bin:/bin" \
    POSTGRES_SMOKE_START_DOCKER=true \
    /bin/bash "$TARGET_SCRIPT" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when docker daemon is unavailable"
  [[ "$output" == *"ERROR: docker daemon is not available."* ]] || fail "missing docker daemon error"
  [[ "$output" == *"start Docker/OrbStack first if you want the default local container path."* ]] || fail "missing daemon readiness hint"
  [[ "$output" == *"RELEASE_TEST_POSTGRES_URL=postgresql://... POSTGRES_SMOKE_START_DOCKER=false npm run smoke:postgres:e2e-local"* ]] || fail "missing RELEASE_TEST_POSTGRES_URL fallback hint"
  [[ "$output" == *"[postgres-smoke] FAQ:"* ]] || fail "missing FAQ output"
  rm -rf "$temp_dir"
}

test_external_mode_without_explicit_connection_warns() {
  local temp_dir fake_bin output rc
  temp_dir="$(mktemp -d)"
  fake_bin="$temp_dir/bin"
  mkdir -p "$fake_bin"
  cat > "$fake_bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exit 99
EOF
  chmod +x "$fake_bin/npm"

  set +e
  output="$(
    PATH="$fake_bin:/usr/bin:/bin" \
    POSTGRES_SMOKE_START_DOCKER=false \
    /bin/bash "$TARGET_SCRIPT" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -eq 99 ]] || fail "expected fake npm exit code after external mode warning path"
  [[ "$output" == *"[postgres-smoke] mode=external-postgres"* ]] || fail "missing external mode log"
  [[ "$output" == *"POSTGRES_SMOKE_START_DOCKER=false but no explicit connection string was provided."* ]] || fail "missing explicit connection warning"
  [[ "$output" == *"prefer setting POSTGRES_CONNECTION_STRING explicitly"* ]] || fail "missing explicit connection recommendation"
  rm -rf "$temp_dir"
}

test_missing_docker_cli_shows_faq
test_missing_daemon_shows_faq
test_external_mode_without_explicit_connection_warns

echo "[local-postgres-e2e-smoke-test] PASS"
