#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/tracking-governance-strict-codes-check.mjs"

fail() {
  echo "[tracking-governance-strict-codes-test] FAIL: $1" >&2
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
  console.error("[tracking-governance-strict-codes-test] JSON assertion failed:", expression);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
NODE
}

test_pass_case() {
  local temp_dir summary_path
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/pass-summary.json"

  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --strict_warning_codes TGW001 >/dev/null

  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes) && data.strict_warning_codes.length === 1 && data.strict_warning_codes[0] === "TGW001"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes_unknown) && data.strict_warning_codes_unknown.length === 0'
  rm -rf "$temp_dir"
}

test_fail_case_unknown_code() {
  local temp_dir summary_path rc
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/fail-summary.json"

  set +e
  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --strict_warning_codes TGW001,TGW999 >/dev/null 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "unknown strict warning codes should fail"
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes_unknown) && data.strict_warning_codes_unknown.length === 1 && data.strict_warning_codes_unknown[0] === "TGW999"'
  rm -rf "$temp_dir"
}

test_allow_unknown_case() {
  local temp_dir summary_path
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/allow-unknown-summary.json"

  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --strict_warning_codes TGW999 --allow_unknown true >/dev/null

  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.allow_unknown === true'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes_unknown) && data.strict_warning_codes_unknown.includes("TGW999")'
  rm -rf "$temp_dir"
}

test_require_non_empty_fails_on_empty_input() {
  local temp_dir summary_path rc
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/require-non-empty-summary.json"

  set +e
  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --require_non_empty true >/dev/null 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "require_non_empty should fail on empty input"
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'data.require_non_empty === true'
  assert_json_expr "$summary_path" 'data.empty_input === true'
  rm -rf "$temp_dir"
}

test_supported_codes_text_mode() {
  local temp_dir summary_path output
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/supported-codes-text-summary.json"

  output="$(
    TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
    node "$TARGET_SCRIPT" --supported_codes true
  )"

  [[ "$output" == *"supported warning code(s): TGW001, TGW002, TGW003"* ]] || fail "expected supported codes output"
  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.mode === "supported_codes"'
  assert_json_expr "$summary_path" 'Array.isArray(data.supported_warning_codes) && data.supported_warning_codes.includes("TGW001") && data.supported_warning_codes.includes("TGW002") && data.supported_warning_codes.includes("TGW003")'
  rm -rf "$temp_dir"
}

test_supported_codes_json_mode() {
  local temp_dir summary_path json_file output
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/supported-codes-json-summary.json"
  json_file="$temp_dir/supported-codes.json"

  output="$(
    TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
    node "$TARGET_SCRIPT" --supported_codes json
  )"

  printf '%s\n' "$output" > "$json_file"
  node - "$json_file" <<'NODE'
const fs = require("node:fs");
const filePath = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (payload.schema_version !== "1.0") {
  throw new Error("schema_version mismatch");
}
if (payload.schema_url !== "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json") {
  throw new Error("schema_url mismatch");
}
if (!Array.isArray(payload.supported_warning_codes) || payload.supported_warning_codes.length < 2) {
  throw new Error("supported_warning_codes json payload mismatch");
}
NODE

  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.mode === "supported_codes"'
  rm -rf "$temp_dir"
}

test_summary_log_can_use_stdout() {
  local temp_dir summary_path stdout_file stderr_file
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/summary-stdout.json"
  stdout_file="$temp_dir/stdout.log"
  stderr_file="$temp_dir/stderr.log"

  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --strict_warning_codes TGW001 --summary_to_stderr false >"$stdout_file" 2>"$stderr_file"

  grep -q "summary-file" "$stdout_file" || fail "expected summary-file log on stdout"
  [[ ! -s "$stderr_file" ]] || fail "stderr should be empty when summary_to_stderr is false"
  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  rm -rf "$temp_dir"
}

test_quiet_mode_suppresses_logs() {
  local temp_dir summary_path stdout_file stderr_file
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/quiet-summary.json"
  stdout_file="$temp_dir/stdout.log"
  stderr_file="$temp_dir/stderr.log"

  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  node "$TARGET_SCRIPT" --strict_warning_codes TGW001 --quiet true >"$stdout_file" 2>"$stderr_file"

  [[ ! -s "$stdout_file" ]] || fail "quiet mode should suppress stdout logs"
  [[ ! -s "$stderr_file" ]] || fail "quiet mode should suppress stderr logs"
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "passed"'
  rm -rf "$temp_dir"
}

test_require_non_empty_from_env() {
  local temp_dir summary_path rc
  temp_dir="$(mktemp -d)"
  summary_path="$temp_dir/require-non-empty-env-summary.json"

  set +e
  TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH="$summary_path" \
  TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY=true \
  node "$TARGET_SCRIPT" >/dev/null 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "require_non_empty from env should fail on empty input"
  assert_json_expr "$summary_path" 'data.schema_version === "1.0"'
  assert_json_expr "$summary_path" 'data.schema_url === "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"'
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'data.require_non_empty === true'
  rm -rf "$temp_dir"
}

test_pass_case
test_fail_case_unknown_code
test_allow_unknown_case
test_require_non_empty_fails_on_empty_input
test_supported_codes_text_mode
test_supported_codes_json_mode
test_summary_log_can_use_stdout
test_quiet_mode_suppresses_logs
test_require_non_empty_from_env

echo "[tracking-governance-strict-codes-test] PASS"
