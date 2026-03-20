#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SET_STATUS_SCRIPT="$ROOT_DIR/docs/tracking/scripts/set_status.sh"

fail() {
  echo "[set-status-governance-test] FAIL: $1" >&2
  exit 1
}

write_fixture_tracking() {
  local tracking_root="$1"
  mkdir -p "$tracking_root/retrospectives" "$tracking_root/sprints"

  cat > "$tracking_root/backlog.csv" <<'EOF'
id,type,parent_id,title,priority,status,sprint,owner,estimate,dependencies,acceptance_ref,source_doc,updated_at
US-9999,Story,E10,测试条目,P1,Ready,S77,codex,1,,test,test,2026-03-02T00:00:00Z
EOF

  cat > "$tracking_root/activity-log.csv" <<'EOF'
timestamp,id,from_status,to_status,owner,reason,source
EOF

  cat > "$tracking_root/risk-register.csv" <<'EOF'
risk_id,title,severity,likelihood,owner,status,mitigation,related_ids,updated_at
R-001,测试风险,Low,Low,codex,Monitoring,测试,US-9999,2026-03-02
EOF

  cat > "$tracking_root/metrics-weekly.csv" <<'EOF'
week_start,sprint,planned_points,completed_points,in_qa_points,carry_over_points,p0_done_count,p0_total_count,defect_p0_open,api_success_rate,ai_p95_first_token_ms,mock_report_p95_sec,notes,updated_at
2026-03-02,S1,1,1,0,0,0,35,0,99.9,1200,120,test,2026-03-02
EOF

  cat > "$tracking_root/releases.md" <<'EOF'
# 发布记录（Release Log）

## 发布记录表
| release_id | date | scope_ids | gate_result | owner | rollback_plan | notes |
|---|---|---|---|---|---|---|
| REL-001 | 2026-03-02 | S1 | PASS（演练环境） | codex | test | test |
EOF
}

test_warn_only() {
  local temp_dir tracking_root output
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  write_fixture_tracking "$tracking_root"

  output="$(
    TRACKING_ROOT="$tracking_root" \
    bash "$SET_STATUS_SCRIPT" "US-9999" "Done" "codex" 2>&1
  )"

  [[ "$output" == *"[set-status] WARN:"* ]] || fail "expected governance warning output"
  [[ "$output" == *"npm run validate:tracking-governance -- --sprint S77"* ]] || fail "expected sprint-specific governance command"
  [[ "$output" == *"tracking-governance-fix-template.sh --summary"* ]] || fail "expected fix-template command"

  local status
  status="$(awk -F',' 'NR>1 && $1=="US-9999" {print $6}' "$tracking_root/backlog.csv")"
  [[ "$status" == "Done" ]] || fail "status should still update when enforce disabled"
  rm -rf "$temp_dir"
}

test_enforce_fail() {
  local temp_dir tracking_root
  temp_dir="$(mktemp -d)"
  tracking_root="$temp_dir/tracking"
  write_fixture_tracking "$tracking_root"

  set +e
  TRACKING_ROOT="$tracking_root" \
  TRACKING_STATUS_ENFORCE_GOVERNANCE=true \
  bash "$SET_STATUS_SCRIPT" "US-9999" "Done" "codex" >/dev/null 2>&1
  local rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero when governance enforcement enabled"

  local status
  status="$(awk -F',' 'NR>1 && $1=="US-9999" {print $6}' "$tracking_root/backlog.csv")"
  [[ "$status" == "Ready" ]] || fail "status should remain Ready when enforce enabled"
  rm -rf "$temp_dir"
}

test_warn_only
test_enforce_fail

echo "[set-status-governance-test] PASS"
