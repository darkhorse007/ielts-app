#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_SCRIPT="$ROOT_DIR/scripts/rc-package-from-gate.mjs"

fail() {
  echo "[rc-package-from-gate-test] FAIL: $1" >&2
  exit 1
}

write_summary() {
  local path="$1"
  cat > "$path" <<'EOF'
{
  "status": "passed",
  "failed_step": "",
  "failed_steps": [],
  "continue_on_error": false,
  "dry_run": false,
  "tracking_governance_strict": true,
  "total_duration_seconds": 57
}
EOF
}

write_tracking_summary() {
  local path="$1"
  cat > "$path" <<'EOF'
{
  "status": "passed",
  "warnings_count": 0,
  "strict_mode": true,
  "strict_warning_codes": ["TGW001", "TGW003"],
  "strict_warning_codes_unknown": [],
  "strict_promoted_warning_codes": [],
  "completed_sprints": ["S1", "S2", "S3", "S4"],
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
| REL-068 | 2026-03-12 | S30(US-11149~US-11156) | PASS（演练环境） | codex | test rollback | test notes |
EOF
}

write_template() {
  local path="$1"
  local title="$2"
  cat > "$path" <<EOF
# ${title}

fixture content for ${title}
EOF
}

test_generates_package_with_tracking_summary() {
  local temp_dir summary tracking_summary releases out_dir output expected_date
  temp_dir="$(mktemp -d)"
  summary="$temp_dir/release-summary.json"
  tracking_summary="$temp_dir/tracking-summary.json"
  releases="$temp_dir/releases.md"
  out_dir="$temp_dir/out"
  expected_date="$(date +%Y-%m-%d)"

  write_summary "$summary"
  write_tracking_summary "$tracking_summary"
  write_releases_file "$releases"
  write_template "$temp_dir/acceptance.md" "RC Acceptance"
  write_template "$temp_dir/issues.md" "Known Issues"
  write_template "$temp_dir/demo.md" "Demo Script"
  write_template "$temp_dir/notes.md" "Release Notes"

  output="$(
    node "$TARGET_SCRIPT" \
      --summary "$summary" \
      --tracking_summary "$tracking_summary" \
      --releases "$releases" \
      --acceptance_template "$temp_dir/acceptance.md" \
      --known_issues_template "$temp_dir/issues.md" \
      --demo_template "$temp_dir/demo.md" \
      --release_notes_template "$temp_dir/notes.md" \
      --out_dir "$out_dir" \
      --scope "S31(US-11157~US-11159)" \
      --rollback "execute rollback" \
      --owner codex
  )"

  [[ "$output" == *"rc package written to"* ]] || fail "expected package creation output"
  [[ -f "$out_dir/README.md" ]] || fail "README missing"
  [[ -f "$out_dir/manifest.json" ]] || fail "manifest missing"
  [[ -f "$out_dir/release-row.md" ]] || fail "release row missing"
  [[ -f "$out_dir/docs/RC-Acceptance-Checklist.md" ]] || fail "acceptance checklist missing"
  [[ -f "$out_dir/docs/RC-Known-Issues-Template.md" ]] || fail "known issues template missing"
  [[ -f "$out_dir/docs/RC-Demo-Script.md" ]] || fail "demo script missing"
  [[ -f "$out_dir/docs/RC-Release-Notes-Template.md" ]] || fail "release notes template missing"
  [[ -f "$out_dir/artifacts/release-check-summary.json" ]] || fail "release summary missing"
  [[ -f "$out_dir/artifacts/tracking-governance-summary.json" ]] || fail "tracking summary missing"
  grep -q "| REL-069 |" "$out_dir/release-row.md" || fail "release row should use next release id"
  grep -q "| REL-069 | $expected_date |" "$out_dir/release-row.md" || fail "release row should use local date"
  grep -q '"tracking_summary_present": true' "$out_dir/manifest.json" || fail "manifest should mark tracking summary present"
  grep -q 'tracking summary: `artifacts/tracking-governance-summary.json`' "$out_dir/README.md" || fail "README should include tracking summary"
  rm -rf "$temp_dir"
}

test_missing_tracking_summary_warns_but_succeeds() {
  local temp_dir summary releases out_dir output
  temp_dir="$(mktemp -d)"
  summary="$temp_dir/release-summary.json"
  releases="$temp_dir/releases.md"
  out_dir="$temp_dir/out"

  write_summary "$summary"
  write_releases_file "$releases"
  write_template "$temp_dir/acceptance.md" "RC Acceptance"
  write_template "$temp_dir/issues.md" "Known Issues"
  write_template "$temp_dir/demo.md" "Demo Script"
  write_template "$temp_dir/notes.md" "Release Notes"

  output="$(
    node "$TARGET_SCRIPT" \
      --summary "$summary" \
      --tracking_summary "$temp_dir/missing-tracking.json" \
      --releases "$releases" \
      --acceptance_template "$temp_dir/acceptance.md" \
      --known_issues_template "$temp_dir/issues.md" \
      --demo_template "$temp_dir/demo.md" \
      --release_notes_template "$temp_dir/notes.md" \
      --out_dir "$out_dir" 2>&1
  )"

  [[ "$output" == *"WARN: tracking summary not found"* ]] || fail "expected missing tracking summary warning"
  [[ -f "$out_dir/README.md" ]] || fail "README missing when tracking summary is absent"
  [[ ! -f "$out_dir/artifacts/tracking-governance-summary.json" ]] || fail "tracking summary should not be copied when absent"
  grep -q '"tracking_summary_present": false' "$out_dir/manifest.json" || fail "manifest should mark tracking summary absent"
  rm -rf "$temp_dir"
}

test_dry_run_does_not_create_directory() {
  local temp_dir summary tracking_summary releases out_dir output
  temp_dir="$(mktemp -d)"
  summary="$temp_dir/release-summary.json"
  tracking_summary="$temp_dir/tracking-summary.json"
  releases="$temp_dir/releases.md"
  out_dir="$temp_dir/out"

  write_summary "$summary"
  write_tracking_summary "$tracking_summary"
  write_releases_file "$releases"
  write_template "$temp_dir/acceptance.md" "RC Acceptance"
  write_template "$temp_dir/issues.md" "Known Issues"
  write_template "$temp_dir/demo.md" "Demo Script"
  write_template "$temp_dir/notes.md" "Release Notes"

  output="$(
    node "$TARGET_SCRIPT" \
      --summary "$summary" \
      --tracking_summary "$tracking_summary" \
      --releases "$releases" \
      --acceptance_template "$temp_dir/acceptance.md" \
      --known_issues_template "$temp_dir/issues.md" \
      --demo_template "$temp_dir/demo.md" \
      --release_notes_template "$temp_dir/notes.md" \
      --out_dir "$out_dir" \
      --dry_run true
  )"

  [[ "$output" == *"[dry-run] would create rc package at"* ]] || fail "expected dry-run output"
  [[ ! -e "$out_dir" ]] || fail "dry-run should not create output directory"
  rm -rf "$temp_dir"
}

test_existing_output_requires_overwrite() {
  local temp_dir summary tracking_summary releases out_dir output rc
  temp_dir="$(mktemp -d)"
  summary="$temp_dir/release-summary.json"
  tracking_summary="$temp_dir/tracking-summary.json"
  releases="$temp_dir/releases.md"
  out_dir="$temp_dir/out"

  write_summary "$summary"
  write_tracking_summary "$tracking_summary"
  write_releases_file "$releases"
  write_template "$temp_dir/acceptance.md" "RC Acceptance"
  write_template "$temp_dir/issues.md" "Known Issues"
  write_template "$temp_dir/demo.md" "Demo Script"
  write_template "$temp_dir/notes.md" "Release Notes"
  mkdir -p "$out_dir"
  echo "fixture" > "$out_dir/existing.txt"

  set +e
  output="$(
    node "$TARGET_SCRIPT" \
      --summary "$summary" \
      --tracking_summary "$tracking_summary" \
      --releases "$releases" \
      --acceptance_template "$temp_dir/acceptance.md" \
      --known_issues_template "$temp_dir/issues.md" \
      --demo_template "$temp_dir/demo.md" \
      --release_notes_template "$temp_dir/notes.md" \
      --out_dir "$out_dir" 2>&1
  )"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected existing output directory without overwrite to fail"
  [[ "$output" == *"output directory already exists"* ]] || fail "missing overwrite guard error"
  grep -q "fixture" "$out_dir/existing.txt" || fail "existing directory should remain untouched"
  rm -rf "$temp_dir"
}

test_generates_package_with_tracking_summary
test_missing_tracking_summary_warns_but_succeeds
test_dry_run_does_not_create_directory
test_existing_output_requires_overwrite

echo "[rc-package-from-gate-test] PASS"
