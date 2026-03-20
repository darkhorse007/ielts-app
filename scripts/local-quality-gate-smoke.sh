#!/usr/bin/env bash
set -euo pipefail

RUN_POSTGRES_CHAOS="${QUALITY_GATE_LOCAL_RUN_POSTGRES_CHAOS:-false}"
RUN_FRONTEND_FULL_E2E="${QUALITY_GATE_LOCAL_RUN_FRONTEND_FULL_E2E:-false}"
RUN_SCRIPT_TESTS="${QUALITY_GATE_LOCAL_RUN_SCRIPT_TESTS:-true}"
RUN_TRACKING_GOVERNANCE="${QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE:-true}"
RUN_TRACKING_GOVERNANCE_STRICT="${QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT:-false}"
RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES="${QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_WARNING_CODES:-}"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK="${QUALITY_GATE_LOCAL_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK:-true}"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY="${QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY:-false}"
CONTINUE_ON_ERROR="${QUALITY_GATE_LOCAL_CONTINUE_ON_ERROR:-false}"
DRY_RUN="${QUALITY_GATE_LOCAL_DRY_RUN:-false}"
ARTIFACTS_ROOT_DIR="${QUALITY_GATE_LOCAL_ARTIFACTS_DIR:-/tmp/ielts-quality-gate-artifacts}"
SUMMARY_JSON_PATH="${QUALITY_GATE_LOCAL_SUMMARY_JSON_PATH:-/tmp/ielts-quality-gate-summary.json}"
TRACKING_GOVERNANCE_SUMMARY_PATH="${QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_SUMMARY_PATH:-/tmp/ielts-tracking-governance-summary.json}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

normalize_bool() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

RUN_POSTGRES_CHAOS_BOOL="$(normalize_bool "$RUN_POSTGRES_CHAOS")"
RUN_FRONTEND_FULL_E2E_BOOL="$(normalize_bool "$RUN_FRONTEND_FULL_E2E")"
RUN_SCRIPT_TESTS_BOOL="$(normalize_bool "$RUN_SCRIPT_TESTS")"
RUN_TRACKING_GOVERNANCE_BOOL="$(normalize_bool "$RUN_TRACKING_GOVERNANCE")"
RUN_TRACKING_GOVERNANCE_STRICT_BOOL="$(normalize_bool "$RUN_TRACKING_GOVERNANCE_STRICT")"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK_BOOL="$(normalize_bool "$RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK")"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_BOOL="$(normalize_bool "$RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY")"
CONTINUE_ON_ERROR_BOOL="$(normalize_bool "$CONTINUE_ON_ERROR")"
DRY_RUN_BOOL="$(normalize_bool "$DRY_RUN")"

collect_failure_artifacts() {
  local run_dir
  run_dir="${ARTIFACTS_ROOT_DIR%/}/run-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$run_dir"

  local candidate_logs=(
    "$SUMMARY_JSON_PATH"
    "$TRACKING_GOVERNANCE_SUMMARY_PATH"
    "/tmp/ielts-api-e2e-backend.log"
    "/tmp/ielts-postgres-server.log"
    "/tmp/ielts-frontend-full-backend.log"
    "/tmp/ielts-frontend-full-frontend.log"
  )

  local copied_any=false
  local copied_files=()
  local log_file
  for log_file in "${candidate_logs[@]}"; do
    if [[ -f "$log_file" ]]; then
      cp "$log_file" "$run_dir/"
      copied_any=true
      copied_files+=("$(basename "$log_file")")
    fi
  done

  local manifest_path="$run_dir/manifest.json"
  {
    echo "{"
    echo "  \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"run_dir\": \"$(json_escape "$run_dir")\","
    echo "  \"summary_json_path\": \"$(json_escape "$SUMMARY_JSON_PATH")\","
    echo "  \"tracking_governance_summary_path\": \"$(json_escape "$TRACKING_GOVERNANCE_SUMMARY_PATH")\","
    echo "  \"continue_on_error\": ${CONTINUE_ON_ERROR_BOOL},"
    echo "  \"dry_run\": ${DRY_RUN_BOOL},"
    echo "  \"flags\": {"
    echo "    \"run_postgres_chaos\": ${RUN_POSTGRES_CHAOS_BOOL},"
    echo "    \"run_frontend_full_e2e\": ${RUN_FRONTEND_FULL_E2E_BOOL},"
    echo "    \"run_script_tests\": ${RUN_SCRIPT_TESTS_BOOL},"
    echo "    \"run_tracking_governance\": ${RUN_TRACKING_GOVERNANCE_BOOL},"
    echo "    \"run_tracking_governance_strict\": ${RUN_TRACKING_GOVERNANCE_STRICT_BOOL},"
    echo "    \"run_tracking_governance_strict_codes_check\": ${RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK_BOOL},"
    echo "    \"run_tracking_governance_strict_codes_require_non_empty\": ${RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_BOOL},"
    echo "    \"run_tracking_governance_strict_warning_codes\": \"$(json_escape "$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES")\""
    echo "  },"
    echo "  \"copied_files\": ["
    local idx
    for idx in "${!copied_files[@]}"; do
      local comma=""
      if [[ "$idx" -lt $((${#copied_files[@]} - 1)) ]]; then
        comma=","
      fi
      echo "    \"$(json_escape "${copied_files[$idx]}")\"${comma}"
    done
    echo "  ]"
    echo "}"
  } > "$manifest_path"

  if [[ "$copied_any" == "false" ]]; then
    echo "no failure artifacts found to collect"
    echo "quality-gate failure manifest saved to $manifest_path"
  else
    echo "quality-gate failure artifacts saved to $run_dir"
    echo "quality-gate failure manifest saved to $manifest_path"
  fi
}

on_error() {
  local exit_code=$?
  collect_failure_artifacts
  exit "$exit_code"
}
trap on_error ERR

RELEASE_AUTOMATION_SUMMARY_PATH="$SUMMARY_JSON_PATH" \
RELEASE_AUTOMATION_RUN_E2E=true \
RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=true \
RELEASE_AUTOMATION_RUN_POSTGRES_CHAOS="$RUN_POSTGRES_CHAOS_BOOL" \
RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E="$RUN_FRONTEND_FULL_E2E_BOOL" \
RELEASE_AUTOMATION_RUN_SCRIPT_TESTS="$RUN_SCRIPT_TESTS_BOOL" \
RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE="$RUN_TRACKING_GOVERNANCE_BOOL" \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT="$RUN_TRACKING_GOVERNANCE_STRICT_BOOL" \
RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK="$RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK_BOOL" \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY="$RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_BOOL" \
RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES="$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES" \
RELEASE_AUTOMATION_CONTINUE_ON_ERROR="$CONTINUE_ON_ERROR_BOOL" \
RELEASE_AUTOMATION_DRY_RUN="$DRY_RUN_BOOL" \
TRACKING_GOVERNANCE_SUMMARY_PATH="$TRACKING_GOVERNANCE_SUMMARY_PATH" \
npm run release:checklist

echo "local quality-gate smoke passed"
echo "quality-gate summary json: $SUMMARY_JSON_PATH"
