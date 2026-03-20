#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_SCRIPT="$ROOT_DIR/scripts/release-automation-check.sh"

fail() {
  echo "[release-script-test] FAIL: $1" >&2
  exit 1
}

assert_json_expr() {
  local json_path="$1"
  local expression="$2"
  node - "$json_path" "$expression" <<'NODE'
const fs = require("node:fs");
const jsonPath = process.argv[2];
const expression = process.argv[3];
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const passed = Boolean(Function("data", `return (${expression});`)(data));
if (!passed) {
  console.error("[release-script-test] JSON assertion failed:", expression);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
NODE
}

build_fake_npm() {
  local temp_bin_dir="$1"
  cat > "$temp_bin_dir/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${FAKE_NPM_LOG:?FAKE_NPM_LOG is required}"
fail_scripts="${FAKE_NPM_FAIL_SCRIPTS:-}"
script_name="${1:-}"

if [[ "${1:-}" == "run" ]]; then
  script_name="${2:-}"
elif [[ "${1:-}" == "test" ]]; then
  script_name="test"
fi

echo "$script_name" >> "$log_file"

case ";${fail_scripts};" in
  *";${script_name};"*) exit 1 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$temp_bin_dir/npm"
}

test_fail_fast() {
  local temp_dir summary_json fake_log
  temp_dir="$(mktemp -d)"
  summary_json="$temp_dir/fail-fast-summary.json"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"
  build_fake_npm "$temp_dir"

  set +e
  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  FAKE_NPM_FAIL_SCRIPTS="typecheck" \
  RELEASE_AUTOMATION_SUMMARY_PATH="$summary_json" \
  RELEASE_AUTOMATION_CONTINUE_ON_ERROR=false \
  RELEASE_AUTOMATION_RUN_E2E=true \
  bash "$CHECK_SCRIPT" >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "fail-fast mode should exit non-zero when typecheck fails"
  assert_json_expr "$summary_json" 'data.status === "failed"'
  assert_json_expr "$summary_json" 'data.failed_step === "typecheck"'
  assert_json_expr "$summary_json" 'Array.isArray(data.failed_steps) && data.failed_steps.length === 1 && data.failed_steps[0] === "typecheck"'

  local call_count
  call_count="$(wc -l < "$fake_log" | tr -d ' ')"
  [[ "$call_count" -eq 1 ]] || fail "fail-fast should stop after first npm command, got ${call_count}"
  rm -rf "$temp_dir"
}

test_continue_on_error() {
  local temp_dir summary_json fake_log
  temp_dir="$(mktemp -d)"
  summary_json="$temp_dir/continue-summary.json"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"
  build_fake_npm "$temp_dir"

  set +e
  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  FAKE_NPM_FAIL_SCRIPTS="typecheck;smoke:postgres:e2e-local" \
  RELEASE_AUTOMATION_SUMMARY_PATH="$summary_json" \
  RELEASE_AUTOMATION_CONTINUE_ON_ERROR=true \
  RELEASE_AUTOMATION_RUN_E2E=true \
  RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true \
  RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true \
  bash "$CHECK_SCRIPT" >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "continue-on-error mode should still return non-zero when failures exist"
  assert_json_expr "$summary_json" 'data.status === "failed"'
  assert_json_expr "$summary_json" 'data.continue_on_error === true'
  assert_json_expr "$summary_json" 'data.failed_step === "typecheck"'
  assert_json_expr "$summary_json" 'data.failed_steps.includes("typecheck") && data.failed_steps.includes("postgres-e2e-local-smoke")'
  assert_json_expr "$summary_json" 'data.steps.some((step) => step.name === "frontend-full-e2e-local")'
  rm -rf "$temp_dir"
}

test_dry_run() {
  local temp_dir summary_json fake_log
  temp_dir="$(mktemp -d)"
  summary_json="$temp_dir/dry-run-summary.json"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"
  build_fake_npm "$temp_dir"

  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  RELEASE_AUTOMATION_SUMMARY_PATH="$summary_json" \
  RELEASE_AUTOMATION_DRY_RUN=true \
  RELEASE_AUTOMATION_CONTINUE_ON_ERROR=true \
  RELEASE_AUTOMATION_RUN_E2E=true \
  RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true \
  RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=true \
  RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT=true \
  RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH=true \
  bash "$CHECK_SCRIPT" >/dev/null 2>&1

  assert_json_expr "$summary_json" 'data.status === "passed"'
  assert_json_expr "$summary_json" 'data.dry_run === true'
  assert_json_expr "$summary_json" 'data.failed_steps.length === 0'
  assert_json_expr "$summary_json" 'data.steps.some((step) => step.status === "dry_run")'
  assert_json_expr "$summary_json" 'data.steps.some((step) => step.name === "client-artifact-build")'
  assert_json_expr "$summary_json" 'data.steps.some((step) => step.name === "client-publish-local")'

  local call_count
  call_count="$(wc -l < "$fake_log" | tr -d ' ')"
  [[ "$call_count" -eq 0 ]] || fail "dry-run mode should not execute npm commands, got ${call_count}"
  rm -rf "$temp_dir"
}

test_tracking_governance_strict_flag() {
  local temp_dir summary_json fake_log
  temp_dir="$(mktemp -d)"
  summary_json="$temp_dir/strict-flag-summary.json"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"
  build_fake_npm "$temp_dir"

  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  RELEASE_AUTOMATION_SUMMARY_PATH="$summary_json" \
  RELEASE_AUTOMATION_DRY_RUN=true \
  RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true \
  RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES="TGW001,TGW099" \
  bash "$CHECK_SCRIPT" >/dev/null 2>&1

  assert_json_expr "$summary_json" 'data.tracking_governance_strict === true'
  assert_json_expr "$summary_json" 'data.tracking_governance_strict_warning_codes === "TGW001,TGW099"'
  assert_json_expr "$summary_json" 'data.tracking_governance_strict_codes_require_non_empty === false'
  assert_json_expr "$summary_json" 'data.steps.some((step) => step.name === "tracking-governance-strict-codes-check")'
  rm -rf "$temp_dir"
}

test_tracking_governance_strict_codes_require_non_empty_flag() {
  local temp_dir summary_json fake_log
  temp_dir="$(mktemp -d)"
  summary_json="$temp_dir/strict-flag-require-non-empty-summary.json"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"
  build_fake_npm "$temp_dir"

  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  RELEASE_AUTOMATION_SUMMARY_PATH="$summary_json" \
  RELEASE_AUTOMATION_DRY_RUN=true \
  RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT=true \
  RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true \
  RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES="TGW001" \
  bash "$CHECK_SCRIPT" >/dev/null 2>&1

  assert_json_expr "$summary_json" 'data.tracking_governance_strict_codes_require_non_empty === true'
  rm -rf "$temp_dir"
}

test_fail_fast
test_continue_on_error
test_dry_run
test_tracking_governance_strict_flag
test_tracking_governance_strict_codes_require_non_empty_flag

echo "[release-script-test] PASS"
