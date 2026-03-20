#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/tracking-sprint-sync-template.sh"

fail() {
  echo "[tracking-sprint-sync-template-test] FAIL: $1" >&2
  exit 1
}

write_fixture_tracking_root() {
  local tracking_root="$1"
  mkdir -p "$tracking_root"

  cat > "$tracking_root/backlog.csv" <<'EOF'
id,type,parent_id,title,priority,status,sprint,owner,estimate,dependencies,acceptance_ref,source_doc,updated_at
US-30999,Story,E10,fixture existing story,P1,Done,S98,codex,1,,fixture,fixture,2026-03-01T00:00:00Z
EOF

  cat > "$tracking_root/activity-log.csv" <<'EOF'
timestamp,id,from_status,to_status,owner,reason,source
2026-03-01T00:05:00Z,S98-CLOSE,In Progress,Done,codex,fixture close,manual
EOF

  cat > "$tracking_root/metrics-weekly.csv" <<'EOF'
week_start,sprint,planned_points,completed_points,in_qa_points,carry_over_points,p0_done_count,p0_total_count,defect_p0_open,api_success_rate,ai_p95_first_token_ms,mock_report_p95_sec,notes,updated_at
2026-03-01,S98,10,10,0,0,35,35,0,99.9,1200,120,fixture metrics,2026-03-01
EOF

  cat > "$tracking_root/sprint-board.md" <<'EOF'
# Sprint Board Snapshot

更新时间: 2026-03-01

## S98
- US-30999 `Done`
EOF
}

test_generates_expected_files_and_rows() {
  local temp_dir out_dir
  temp_dir="$(mktemp -d)"
  out_dir="$temp_dir/out"

  bash "$TARGET_SCRIPT" \
    --sprint S99 \
    --start_story_id US-20001 \
    --story_count 3 \
    --out_dir "$out_dir" \
    --date 2026-03-05 \
    --owner codex \
    --source_doc S99-Atomic-Tasks \
    --dependency_anchor US-19999 >/dev/null

  [[ -f "$out_dir/backlog.append.csv" ]] || fail "backlog append file missing"
  [[ -f "$out_dir/activity-log.append.csv" ]] || fail "activity append file missing"
  [[ -f "$out_dir/activity-close.append.csv" ]] || fail "activity close append file missing"
  [[ -f "$out_dir/metrics-weekly.append.csv" ]] || fail "metrics append file missing"
  [[ -f "$out_dir/sprint-board.section.md" ]] || fail "sprint-board section file missing"
  [[ -f "$out_dir/implementation-report.snippet.md" ]] || fail "implementation report snippet missing"
  [[ -f "$out_dir/summary.txt" ]] || fail "summary file missing"

  local backlog_count
  backlog_count="$(awk 'END{print NR+0}' "$out_dir/backlog.append.csv")"
  [[ "$backlog_count" -eq 3 ]] || fail "expected 3 backlog rows, got $backlog_count"

  local first_dep second_dep third_dep
  first_dep="$(awk -F',' 'NR==1 {print $10}' "$out_dir/backlog.append.csv")"
  second_dep="$(awk -F',' 'NR==2 {print $10}' "$out_dir/backlog.append.csv")"
  third_dep="$(awk -F',' 'NR==3 {print $10}' "$out_dir/backlog.append.csv")"
  [[ "$first_dep" == "US-19999" ]] || fail "first dependency should match anchor"
  [[ "$second_dep" == "US-20001" ]] || fail "second dependency should point to previous story"
  [[ "$third_dep" == "US-20002" ]] || fail "third dependency should point to previous story"

  grep -q '^## S99$' "$out_dir/sprint-board.section.md" || fail "sprint-board section header mismatch"
  grep -q 'US-20003' "$out_dir/sprint-board.section.md" || fail "sprint-board missing last story"

  grep -q 'story_range=US-20001~US-20003' "$out_dir/summary.txt" || fail "summary story range mismatch"
  grep -q 'S99-CLOSE' "$out_dir/activity-close.append.csv" || fail "missing close placeholder"
  grep -q '^2026-03-05,S99,' "$out_dir/metrics-weekly.append.csv" || fail "metrics row mismatch"

  rm -rf "$temp_dir"
}

test_invalid_story_id_fails() {
  local temp_dir rc
  temp_dir="$(mktemp -d)"

  set +e
  bash "$TARGET_SCRIPT" --sprint S99 --start_story_id BAD-ID --out_dir "$temp_dir/out" >/dev/null 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "invalid story id should fail"
  rm -rf "$temp_dir"
}

test_story_id_collision_fails() {
  local temp_dir tracking_root rc
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  write_fixture_tracking_root "$tracking_root"

  set +e
  bash "$TARGET_SCRIPT" \
    --sprint S99 \
    --start_story_id US-30999 \
    --story_count 2 \
    --tracking_root "$tracking_root" \
    --backlog_file "$tracking_root/backlog.csv" \
    --out_dir "$temp_dir/out" >"$temp_dir/collision.log" 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "duplicate story ids should fail"
  grep -q "already exists in backlog" "$temp_dir/collision.log" || fail "missing collision error message"
  rm -rf "$temp_dir"
}

test_apply_mode_appends_to_tracking_files() {
  local temp_dir tracking_root out_dir
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  out_dir="$temp_dir/out"
  write_fixture_tracking_root "$tracking_root"

  bash "$TARGET_SCRIPT" \
    --sprint S99 \
    --start_story_id US-40001 \
    --story_count 2 \
    --tracking_root "$tracking_root" \
    --out_dir "$out_dir" \
    --date 2026-03-06 \
    --dependency_anchor US-39999 \
    --apply true >/dev/null

  grep -q '^US-40001,' "$tracking_root/backlog.csv" || fail "apply should append backlog row US-40001"
  grep -q '^US-40002,' "$tracking_root/backlog.csv" || fail "apply should append backlog row US-40002"
  grep -q 'S99-CLOSE' "$tracking_root/activity-log.csv" || fail "apply should append sprint close activity"
  grep -q '^2026-03-06,S99,' "$tracking_root/metrics-weekly.csv" || fail "apply should append metrics row"
  grep -q '^更新时间: 2026-03-06$' "$tracking_root/sprint-board.md" || fail "apply should refresh sprint-board date"
  grep -q '^## S99$' "$tracking_root/sprint-board.md" || fail "apply should append sprint-board section"
  grep -q '^apply=true$' "$out_dir/summary.txt" || fail "summary should mark apply=true"
  grep -q '^dry_run=false$' "$out_dir/summary.txt" || fail "summary should mark dry_run=false"

  rm -rf "$temp_dir"
}

test_apply_mode_dry_run_does_not_write_targets() {
  local temp_dir tracking_root out_dir output before_backlog before_activity before_metrics before_board after_backlog after_activity after_metrics after_board
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  out_dir="$temp_dir/out"
  write_fixture_tracking_root "$tracking_root"

  before_backlog="$(cksum "$tracking_root/backlog.csv" | awk '{print $1":"$2}')"
  before_activity="$(cksum "$tracking_root/activity-log.csv" | awk '{print $1":"$2}')"
  before_metrics="$(cksum "$tracking_root/metrics-weekly.csv" | awk '{print $1":"$2}')"
  before_board="$(cksum "$tracking_root/sprint-board.md" | awk '{print $1":"$2}')"

  output="$(
    bash "$TARGET_SCRIPT" \
      --sprint S97 \
      --start_story_id US-50001 \
      --story_count 2 \
      --tracking_root "$tracking_root" \
      --out_dir "$out_dir" \
      --date 2026-03-06 \
      --dependency_anchor US-49999 \
      --apply true \
      --dry_run true
  )"

  after_backlog="$(cksum "$tracking_root/backlog.csv" | awk '{print $1":"$2}')"
  after_activity="$(cksum "$tracking_root/activity-log.csv" | awk '{print $1":"$2}')"
  after_metrics="$(cksum "$tracking_root/metrics-weekly.csv" | awk '{print $1":"$2}')"
  after_board="$(cksum "$tracking_root/sprint-board.md" | awk '{print $1":"$2}')"

  [[ "$before_backlog" == "$after_backlog" ]] || fail "dry-run should not modify backlog.csv"
  [[ "$before_activity" == "$after_activity" ]] || fail "dry-run should not modify activity-log.csv"
  [[ "$before_metrics" == "$after_metrics" ]] || fail "dry-run should not modify metrics-weekly.csv"
  [[ "$before_board" == "$after_board" ]] || fail "dry-run should not modify sprint-board.md"
  [[ "$output" == *"dry-run true (apply not executed)"* ]] || fail "dry-run output marker missing"
  grep -q '^apply=true$' "$out_dir/summary.txt" || fail "summary should mark apply=true in dry-run"
  grep -q '^dry_run=true$' "$out_dir/summary.txt" || fail "summary should mark dry_run=true"

  rm -rf "$temp_dir"
}

test_apply_mode_blocks_existing_board_section() {
  local temp_dir tracking_root rc
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  write_fixture_tracking_root "$tracking_root"
  cat >> "$tracking_root/sprint-board.md" <<'EOF'

## S96
- US-60000 `Done`
EOF

  set +e
  bash "$TARGET_SCRIPT" \
    --sprint S96 \
    --start_story_id US-60001 \
    --story_count 2 \
    --tracking_root "$tracking_root" \
    --date 2026-03-06 \
    --dependency_anchor US-60000 \
    --apply true >"$temp_dir/apply-board-conflict.log" 2>&1
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "apply should fail when sprint-board section already exists"
  grep -q "sprint-board section already exists" "$temp_dir/apply-board-conflict.log" || fail "missing board section conflict message"
  if grep -q '^US-60001,' "$tracking_root/backlog.csv"; then
    fail "apply conflict should not append backlog rows"
  fi
  rm -rf "$temp_dir"
}

test_generates_expected_files_and_rows
test_invalid_story_id_fails
test_story_id_collision_fails
test_apply_mode_appends_to_tracking_files
test_apply_mode_dry_run_does_not_write_targets
test_apply_mode_blocks_existing_board_section

echo "[tracking-sprint-sync-template-test] PASS"
