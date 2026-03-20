#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/tracking-governance-fix-template.sh"

fail() {
  echo "[tracking-governance-fix-template-test] FAIL: $1" >&2
  exit 1
}

write_fixture_tracking() {
  local tracking_root="$1"
  mkdir -p "$tracking_root/sprints" "$tracking_root/retrospectives"

  cat > "$tracking_root/metrics-weekly.csv" <<'EOF'
week_start,sprint,planned_points,completed_points,in_qa_points,carry_over_points,p0_done_count,p0_total_count,defect_p0_open,api_success_rate,ai_p95_first_token_ms,mock_report_p95_sec,notes,updated_at
2026-03-03,S77,5,5,0,0,0,35,0,99.9,1200,120,existing,2026-03-03
EOF

  cat > "$tracking_root/activity-log.csv" <<'EOF'
timestamp,id,from_status,to_status,owner,reason,source
2026-03-03T10:00:00Z,S77-CLOSE,In Progress,Done,codex,existing close,manual
EOF
}

test_apply_script_is_idempotent() {
  local temp_dir tracking_root summary_path output_dir metrics_count activity_count
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/summary.json"
  output_dir="$temp_dir/fix-output"

  write_fixture_tracking "$tracking_root"

  cat > "$summary_path" <<EOF
{
  "tracking_root": "$tracking_root",
  "missing_sprint_docs": [],
  "missing_retrospectives": [],
  "missing_metrics_sprints": ["S77"],
  "missing_activity_sprints": ["S77"]
}
EOF

  bash "$TARGET_SCRIPT" --summary "$summary_path" --output_dir "$output_dir" >/dev/null
  [[ -f "$output_dir/fix-steps.md" ]] || fail "fix-steps.md should be generated"
  [[ -f "$output_dir/apply-fixes.sh" ]] || fail "apply-fixes.sh should be generated"

  bash "$output_dir/apply-fixes.sh" "$tracking_root" >/dev/null
  bash "$output_dir/apply-fixes.sh" "$tracking_root" >/dev/null

  metrics_count="$(awk -F',' 'NR>1 && $2=="S77" {count++} END{print count+0}' "$tracking_root/metrics-weekly.csv")"
  activity_count="$(awk -F',' 'NR>1 && $2=="S77-CLOSE" && $4=="Done" {count++} END{print count+0}' "$tracking_root/activity-log.csv")"

  [[ "$metrics_count" -eq 1 ]] || fail "metrics placeholder should not be duplicated"
  [[ "$activity_count" -eq 1 ]] || fail "activity placeholder should not be duplicated"
  rm -rf "$temp_dir"
}

test_dry_run_does_not_generate_files() {
  local temp_dir tracking_root summary_path output_dir output
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/summary-dry-run.json"
  output_dir="$temp_dir/fix-dry-run-output"

  write_fixture_tracking "$tracking_root"

  cat > "$summary_path" <<EOF
{
  "tracking_root": "$tracking_root",
  "missing_sprint_docs": ["S77"],
  "missing_retrospectives": ["S77"],
  "missing_metrics_sprints": ["S77"],
  "missing_activity_sprints": ["S77"],
  "recommended_actions": ["rerun: npm run validate:tracking-governance"]
}
EOF

  output="$(
    bash "$TARGET_SCRIPT" --summary "$summary_path" --output_dir "$output_dir" --dry_run true
  )"

  [[ "$output" == *"dry-run true"* ]] || fail "dry-run output marker missing"
  [[ "$output" == *"planned sprint templates: 1"* ]] || fail "dry-run planned sprint count mismatch"
  [[ "$output" == *"planned metrics placeholders: 1"* ]] || fail "dry-run planned metrics count mismatch"
  [[ ! -d "$output_dir" ]] || fail "dry-run should not generate output directory"
  rm -rf "$temp_dir"
}

test_dry_run_json_output() {
  local temp_dir tracking_root summary_path output_dir output json_file
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/summary-dry-run-json.json"
  output_dir="$temp_dir/fix-dry-run-json-output"
  json_file="$temp_dir/dry-run.json"

  write_fixture_tracking "$tracking_root"

  cat > "$summary_path" <<EOF
{
  "tracking_root": "$tracking_root",
  "missing_sprint_docs": ["S77"],
  "missing_retrospectives": ["S77"],
  "missing_metrics_sprints": ["S77"],
  "missing_activity_sprints": ["S77"],
  "recommended_actions": ["rerun: npm run validate:tracking-governance"]
}
EOF

  output="$(
    bash "$TARGET_SCRIPT" --summary "$summary_path" --output_dir "$output_dir" --dry_run true --output_format json
  )"

  printf '%s\n' "$output" > "$json_file"
  node - "$json_file" <<'NODE'
const fs = require("node:fs");
const filePath = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (payload.status !== "dry_run") {
  throw new Error("status should be dry_run");
}
if (payload.output_format !== "json") {
  throw new Error("output_format should be json");
}
if (!payload.planned || payload.planned.sprint_templates !== 1 || payload.planned.metrics_placeholders !== 1) {
  throw new Error("planned counts mismatch");
}
if (typeof payload.apply_command !== "string" || !payload.apply_command.includes("apply-fixes.sh")) {
  throw new Error("apply_command should include apply-fixes.sh");
}
if (!Array.isArray(payload.recommended_actions) || payload.recommended_actions.length !== 1) {
  throw new Error("recommended_actions should be carried into dry-run json");
}
NODE

  [[ ! -d "$output_dir" ]] || fail "dry-run json mode should not generate output directory"
  rm -rf "$temp_dir"
}

test_dry_run_json_out_file() {
  local temp_dir tracking_root summary_path output_dir output_file output
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/summary-dry-run-json-out.json"
  output_dir="$temp_dir/fix-dry-run-json-out-output"
  output_file="$temp_dir/dry-run-payload.json"

  write_fixture_tracking "$tracking_root"

  cat > "$summary_path" <<EOF
{
  "tracking_root": "$tracking_root",
  "missing_sprint_docs": ["S77"],
  "missing_retrospectives": ["S77"],
  "missing_metrics_sprints": ["S77"],
  "missing_activity_sprints": ["S77"]
}
EOF

  output="$(
    bash "$TARGET_SCRIPT" --summary "$summary_path" --output_dir "$output_dir" --dry_run true --output_format json --out "$output_file"
  )"

  [[ "$output" == *"json-output-file $output_file"* ]] || fail "expected json out file hint"
  [[ -f "$output_file" ]] || fail "expected dry-run json output file"
  node - "$output_file" <<'NODE'
const fs = require("node:fs");
const filePath = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (payload.status !== "dry_run") {
  throw new Error("status should be dry_run");
}
if (!payload.planned || payload.planned.activity_placeholders !== 1) {
  throw new Error("planned activity placeholders mismatch");
}
NODE

  [[ ! -d "$output_dir" ]] || fail "dry-run json out mode should not generate output directory"
  rm -rf "$temp_dir"
}

test_out_without_dry_run_json_fails() {
  local temp_dir tracking_root summary_path output_dir rc
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  summary_path="$temp_dir/summary-invalid-out.json"
  output_dir="$temp_dir/fix-invalid-out-output"

  write_fixture_tracking "$tracking_root"

  cat > "$summary_path" <<EOF
{
  "tracking_root": "$tracking_root",
  "missing_sprint_docs": [],
  "missing_retrospectives": [],
  "missing_metrics_sprints": [],
  "missing_activity_sprints": []
}
EOF

  set +e
  bash "$TARGET_SCRIPT" --summary "$summary_path" --output_dir "$output_dir" --out "$temp_dir/invalid.json" >/dev/null 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "--out without dry_run json should fail"
  rm -rf "$temp_dir"
}

test_apply_script_is_idempotent
test_dry_run_does_not_generate_files
test_dry_run_json_output
test_dry_run_json_out_file
test_out_without_dry_run_json_fails

echo "[tracking-governance-fix-template-test] PASS"
