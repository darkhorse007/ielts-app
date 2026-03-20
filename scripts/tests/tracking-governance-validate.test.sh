#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VALIDATOR_SCRIPT="$ROOT_DIR/scripts/tracking-governance-validate.mjs"

fail() {
  echo "[tracking-governance-test] FAIL: $1" >&2
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
  console.error("[tracking-governance-test] JSON assertion failed:", expression);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
NODE
}

write_fixture_files() {
  local tracking_root="$1"
  local epic_status="${2:-Done}"
  mkdir -p "$tracking_root/sprints" "$tracking_root/retrospectives"

  cat > "$tracking_root/backlog.csv" <<'EOF'
id,type,parent_id,title,priority,status,sprint,owner,estimate,dependencies,acceptance_ref,source_doc,updated_at
EOF
  printf 'E10,Epic,,跨平台质量与发布,P0,%s,S8-S12,unassigned,26,,Epic 完成标准,Epic-Map,2026-03-07T02:20:00Z\n' "$epic_status" >> "$tracking_root/backlog.csv"
  cat >> "$tracking_root/backlog.csv" <<'EOF'
US-1001,Story,E10,测试 Story,P1,Done,S1,codex,3,,见 Story 验收标准,Story-Catalog-P1,2026-03-02T10:00:00Z
EOF

  cat > "$tracking_root/activity-log.csv" <<'EOF'
timestamp,id,from_status,to_status,owner,reason,source
2026-03-02T10:00:00Z,US-1001,In Progress,Done,codex,test,manual
EOF

  cat > "$tracking_root/risk-register.csv" <<'EOF'
risk_id,title,severity,likelihood,owner,status,mitigation,related_ids,updated_at
R-001,测试风险,Low,Low,codex,Monitoring,测试,US-1001,2026-03-02
EOF

  cat > "$tracking_root/metrics-weekly.csv" <<'EOF'
week_start,sprint,planned_points,completed_points,in_qa_points,carry_over_points,p0_done_count,p0_total_count,defect_p0_open,api_success_rate,ai_p95_first_token_ms,mock_report_p95_sec,notes,updated_at
2026-03-02,S1,3,3,0,0,0,35,0,99.9,1200,120,测试,2026-03-02
EOF

  cat > "$tracking_root/releases.md" <<'EOF'
# 发布记录（Release Log）

## 发布记录表
| release_id | date | scope_ids | gate_result | owner | rollback_plan | notes |
|---|---|---|---|---|---|---|
| REL-001 | 2026-03-02 | S1 | PASS（演练环境） | codex | 回滚方案 | 测试 |
EOF

  cat > "$tracking_root/sprints/S1.md" <<'EOF'
# Sprint S1
EOF

  cat > "$tracking_root/retrospectives/S1.md" <<'EOF'
# Sprint Retro

## 6. Action Items（下个 Sprint 必做）
| action | owner | due_date | related_id |
|---|---|---|---|
| 测试项 | codex | 2026-03-03 | US-1001 |
EOF
}

write_fixture_without_activity() {
  local tracking_root="$1"
  write_fixture_files "$tracking_root" "Done"
  cat > "$tracking_root/activity-log.csv" <<'EOF'
timestamp,id,from_status,to_status,owner,reason,source
2026-03-02T10:00:00Z,US-9999,In Progress,Done,codex,keep global activity date current,manual
EOF
}

test_pass_case() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/pass-summary.json"

  write_fixture_files "$tracking_root"

  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" >/dev/null

  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.completed_sprints) && data.completed_sprints.length === 1 && data.completed_sprints[0] === "S1"'
  rm -rf "$temp_dir"
}

test_fail_case_missing_retro() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/fail-summary.json"

  write_fixture_files "$tracking_root"
  rm -f "$tracking_root/retrospectives/S1.md"

  set +e
  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "missing retrospective should fail"
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.issues) && data.issues.some((issue) => issue.includes("missing retrospective file"))'
  assert_json_expr "$summary_path" 'Array.isArray(data.recommended_actions) && data.recommended_actions.some((action) => action.includes("create the missing retrospective file"))'
  assert_json_expr "$summary_path" 'data.recommended_actions.includes("rerun: npm run validate:tracking-governance")'
  rm -rf "$temp_dir"
}

test_warning_case_missing_activity_global_mode() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/warn-summary.json"

  write_fixture_without_activity "$tracking_root"

  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" >/dev/null

  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.warnings_count > 0'
  assert_json_expr "$summary_path" 'Array.isArray(data.warning_details) && data.warning_details.some((warning) => warning.code === "TGW001")'
  assert_json_expr "$summary_path" 'Array.isArray(data.missing_activity_sprints) && data.missing_activity_sprints.includes("S1")'
  rm -rf "$temp_dir"
}

test_warning_case_epic_rollup_drift() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/epic-rollup-warning-summary.json"

  write_fixture_files "$tracking_root" "Ready"

  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" >/dev/null

  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.warning_details) && data.warning_details.some((warning) => warning.code === "TGW003")'
  assert_json_expr "$summary_path" 'Array.isArray(data.epic_status_rollup_warnings) && data.epic_status_rollup_warnings.length === 1'
  assert_json_expr "$summary_path" 'data.epic_status_rollup_warnings[0].epic_id === "E10"'
  assert_json_expr "$summary_path" 'data.epic_status_rollup_warnings[0].all_child_stories_completed === true'
  assert_json_expr "$summary_path" 'Array.isArray(data.recommended_actions) && data.recommended_actions.some((action) => action.includes("Epic statuses"))'
  rm -rf "$temp_dir"
}

test_strict_mode_promotes_warning_to_issue() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/strict-summary.json"

  write_fixture_without_activity "$tracking_root"

  set +e
  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" --strict true >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "strict mode should fail when warnings exist"
  assert_json_expr "$summary_path" 'data.strict_mode === true'
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.issue_details) && data.issue_details.some((issue) => issue.code === "TG014")'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_promoted_warning_codes) && data.strict_promoted_warning_codes.includes("TGW001")'
  rm -rf "$temp_dir"
}

test_strict_mode_promotes_epic_rollup_warning() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/strict-epic-rollup-summary.json"

  write_fixture_files "$tracking_root" "Ready"

  set +e
  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" --strict true --strict_warning_codes TGW003 >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "strict mode should fail when TGW003 warning is promoted"
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_promoted_warning_codes) && data.strict_promoted_warning_codes.includes("TGW003")'
  assert_json_expr "$summary_path" 'Array.isArray(data.issue_details) && data.issue_details.some((issue) => issue.code === "TG014" && issue.message.includes("TGW003"))'
  rm -rf "$temp_dir"
}

test_strict_mode_with_unmatched_warning_codes_passes() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/strict-filtered-summary.json"

  write_fixture_without_activity "$tracking_root"

  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" --strict true --strict_warning_codes TGW999 >/dev/null

  assert_json_expr "$summary_path" 'data.strict_mode === true'
  assert_json_expr "$summary_path" 'data.status === "passed"'
  assert_json_expr "$summary_path" 'data.warnings_count > 0 && data.issues_count === 0'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes) && data.strict_warning_codes.length === 1 && data.strict_warning_codes[0] === "TGW999"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes_unknown) && data.strict_warning_codes_unknown.length === 1 && data.strict_warning_codes_unknown[0] === "TGW999"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_promoted_warning_codes) && data.strict_promoted_warning_codes.length === 0'
  assert_json_expr "$summary_path" 'Array.isArray(data.warning_details) && data.warning_details.some((warning) => warning.code === "TGW002")'
  rm -rf "$temp_dir"
}

test_strict_warning_code_normalization() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/strict-normalization-summary.json"

  write_fixture_without_activity "$tracking_root"

  set +e
  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" --strict true --strict_warning_codes tgw001 >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "strict normalization case should still fail due promoted TGW001"
  assert_json_expr "$summary_path" 'data.status === "failed"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes) && data.strict_warning_codes.length === 1 && data.strict_warning_codes[0] === "TGW001"'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_warning_codes_unknown) && data.strict_warning_codes_unknown.length === 0'
  assert_json_expr "$summary_path" 'Array.isArray(data.strict_promoted_warning_codes) && data.strict_promoted_warning_codes.includes("TGW001")'
  rm -rf "$temp_dir"
}

test_sprint_mode_invalid_format() {
  local temp_dir tracking_root summary_path
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/sprint-invalid-summary.json"

  write_fixture_files "$tracking_root"

  set +e
  TRACKING_GOVERNANCE_SUMMARY_PATH="$summary_path" \
  node "$VALIDATOR_SCRIPT" --tracking_root "$tracking_root" --sprint BAD >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "invalid sprint format should fail"
  assert_json_expr "$summary_path" 'data.mode === "sprint_self_check"'
  assert_json_expr "$summary_path" 'Array.isArray(data.issue_details) && data.issue_details.some((issue) => issue.code === "TG012")'
  rm -rf "$temp_dir"
}

test_pass_case
test_fail_case_missing_retro
test_warning_case_missing_activity_global_mode
test_warning_case_epic_rollup_drift
test_strict_mode_promotes_warning_to_issue
test_strict_mode_promotes_epic_rollup_warning
test_strict_mode_with_unmatched_warning_codes_passes
test_strict_warning_code_normalization
test_sprint_mode_invalid_format

echo "[tracking-governance-test] PASS"
