#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/release-record-from-gate.sh"

fail() {
  echo "[release-record-from-gate-test] FAIL: $1" >&2
  exit 1
}

build_fake_npm() {
  local temp_bin_dir="$1"
  cat > "$temp_bin_dir/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "run" || "${2:-}" != "release:record:candidate" ]]; then
  echo "unsupported fake npm invocation: $*" >&2
  exit 1
fi

shift 2
if [[ "${1:-}" == "--" ]]; then
  shift
fi

log_file="${FAKE_NPM_LOG:?FAKE_NPM_LOG is required}"
candidate_script="${RELEASE_RECORD_CANDIDATE_SCRIPT:?RELEASE_RECORD_CANDIDATE_SCRIPT is required}"

printf '%q ' "$@" >> "$log_file"
printf '\n' >> "$log_file"

node "$candidate_script" "$@"
EOF
  chmod +x "$temp_bin_dir/npm"
}

write_gate_summary() {
  local path="$1"
  cat > "$path" <<'EOF'
{
  "status": "passed",
  "failed_step": "",
  "failed_steps": [],
  "continue_on_error": false,
  "dry_run": false,
  "total_duration_seconds": 12
}
EOF
}

write_tracking_summary() {
  local path="$1"
  cat > "$path" <<'EOF'
{
  "status": "passed",
  "warnings_count": 1,
  "strict_mode": true,
  "strict_warning_codes": ["TGW001"],
  "strict_warning_codes_unknown": [],
  "strict_promoted_warning_codes": ["TGW001"],
  "completed_sprints": ["S1", "S2", "S3"],
  "missing_retrospectives": [],
  "missing_metrics_sprints": []
}
EOF
}

write_releases_file() {
  local path="$1"
  cat > "$path" <<'EOF'
# 发布记录（Release Log）

## 发布记录表
| release_id | date | scope_ids | gate_result | owner | rollback_plan | notes |
|---|---|---|---|---|---|---|
| REL-047 | 2026-03-02 | S10-governance-hardening | PASS（演练环境） | codex | test | test |
EOF
}

test_dry_run_with_missing_tracking_summary_warns() {
  local temp_dir gate_summary releases_file fake_log missing_tracking output
  temp_dir="$(mktemp -d)"
  gate_summary="$temp_dir/gate-summary.json"
  releases_file="$temp_dir/releases.md"
  fake_log="$temp_dir/fake-npm.log"
  missing_tracking="$temp_dir/missing-tracking-summary.json"
  : > "$fake_log"

  write_gate_summary "$gate_summary"
  write_releases_file "$releases_file"
  build_fake_npm "$temp_dir"

  output="$(
    PATH="$temp_dir:$PATH" \
    FAKE_NPM_LOG="$fake_log" \
    RELEASE_RECORD_CANDIDATE_SCRIPT="$ROOT_DIR/scripts/release-record-candidate.mjs" \
    RELEASE_GATE_SUMMARY_PATH="$gate_summary" \
    TRACKING_GOVERNANCE_SUMMARY_PATH="$missing_tracking" \
    RELEASE_RECORD_APPEND=true \
    RELEASE_RECORD_DRY_RUN=true \
    bash "$TARGET_SCRIPT" --releases "$releases_file" --release_id REL-900 2>&1
  )"

  [[ "$output" == *"[release-record-from-gate] WARN: tracking summary not found"* ]] || fail "expected warning for missing tracking summary"
  [[ "$output" == *"[dry-run] would append release row"* ]] || fail "expected dry-run append output"
  [[ "$output" == *"summary_artifact=quality-gate-summary-json"* ]] || fail "expected summary artifact field in notes"
  if grep -q "| REL-900 |" "$releases_file"; then
    fail "dry-run should not append REL-900 into releases file"
  fi
  rm -rf "$temp_dir"
}

test_append_success_with_tracking_summary() {
  local temp_dir gate_summary tracking_summary releases_file fake_log output expected_date
  temp_dir="$(mktemp -d)"
  gate_summary="$temp_dir/gate-summary.json"
  tracking_summary="$temp_dir/tracking-summary.json"
  releases_file="$temp_dir/releases.md"
  fake_log="$temp_dir/fake-npm.log"
  expected_date="$(date +%Y-%m-%d)"
  : > "$fake_log"

  write_gate_summary "$gate_summary"
  write_tracking_summary "$tracking_summary"
  write_releases_file "$releases_file"
  build_fake_npm "$temp_dir"

  output="$(
    PATH="$temp_dir:$PATH" \
    FAKE_NPM_LOG="$fake_log" \
    RELEASE_RECORD_CANDIDATE_SCRIPT="$ROOT_DIR/scripts/release-record-candidate.mjs" \
    RELEASE_GATE_SUMMARY_PATH="$gate_summary" \
    TRACKING_GOVERNANCE_SUMMARY_PATH="$tracking_summary" \
    RELEASE_RECORD_APPEND=true \
    RELEASE_RECORD_DRY_RUN=false \
    bash "$TARGET_SCRIPT" --releases "$releases_file" --release_id REL-901 2>&1
  )"

  [[ "$output" == *"release row appended to"* ]] || fail "expected append success output"
  grep -q "| REL-901 |" "$releases_file" || fail "expected REL-901 row appended"
  grep -q "| REL-901 | $expected_date |" "$releases_file" || fail "expected local date in appended release row"
  grep -q "tracking_status=passed" "$releases_file" || fail "expected tracking summary fields in notes"
  grep -q "tracking_warnings=1" "$releases_file" || fail "expected tracking warnings in notes"
  grep -q "tracking_strict_mode=true" "$releases_file" || fail "expected tracking strict mode in notes"
  grep -q "tracking_strict_warning_codes=TGW001" "$releases_file" || fail "expected strict warning codes in notes"
  grep -q "tracking_strict_promoted_warning_codes=TGW001" "$releases_file" || fail "expected promoted warning codes in notes"
  grep -q "summary_artifact=quality-gate-summary-json" "$releases_file" || fail "expected summary artifact in notes"
  grep -q "tracking_artifact=quality-gate-tracking-governance-summary" "$releases_file" || fail "expected tracking artifact in notes"
  rm -rf "$temp_dir"
}

test_append_duplicate_release_id_fails() {
  local temp_dir gate_summary tracking_summary releases_file fake_log output rc
  temp_dir="$(mktemp -d)"
  gate_summary="$temp_dir/gate-summary.json"
  tracking_summary="$temp_dir/tracking-summary.json"
  releases_file="$temp_dir/releases.md"
  fake_log="$temp_dir/fake-npm.log"
  : > "$fake_log"

  write_gate_summary "$gate_summary"
  write_tracking_summary "$tracking_summary"
  write_releases_file "$releases_file"
  build_fake_npm "$temp_dir"

  PATH="$temp_dir:$PATH" \
  FAKE_NPM_LOG="$fake_log" \
  RELEASE_RECORD_CANDIDATE_SCRIPT="$ROOT_DIR/scripts/release-record-candidate.mjs" \
  RELEASE_GATE_SUMMARY_PATH="$gate_summary" \
  TRACKING_GOVERNANCE_SUMMARY_PATH="$tracking_summary" \
  RELEASE_RECORD_APPEND=true \
  RELEASE_RECORD_DRY_RUN=false \
  bash "$TARGET_SCRIPT" --releases "$releases_file" --release_id REL-901 >/dev/null 2>&1

  set +e
  output="$(
    PATH="$temp_dir:$PATH" \
    FAKE_NPM_LOG="$fake_log" \
    RELEASE_RECORD_CANDIDATE_SCRIPT="$ROOT_DIR/scripts/release-record-candidate.mjs" \
    RELEASE_GATE_SUMMARY_PATH="$gate_summary" \
    TRACKING_GOVERNANCE_SUMMARY_PATH="$tracking_summary" \
    RELEASE_RECORD_APPEND=true \
    RELEASE_RECORD_DRY_RUN=false \
    bash "$TARGET_SCRIPT" --releases "$releases_file" --release_id REL-901 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when appending duplicate release id"
  [[ "$output" == *"release id already exists: REL-901"* ]] || fail "expected duplicate release id error"
  rm -rf "$temp_dir"
}

test_dry_run_with_missing_tracking_summary_warns
test_append_success_with_tracking_summary
test_append_duplicate_release_id_fails

echo "[release-record-from-gate-test] PASS"
