#!/usr/bin/env bash
set -euo pipefail

RUN_E2E="${RELEASE_AUTOMATION_RUN_E2E:-true}"
RUN_POSTGRES_SMOKE="${RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE:-true}"
RUN_FRONTEND_FULL_E2E="${RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E:-true}"
RUN_CLIENT_ARTIFACT="${RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT:-true}"
RUN_CLIENT_PUBLISH="${RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH:-true}"
RUN_SCRIPT_TESTS="${RELEASE_AUTOMATION_RUN_SCRIPT_TESTS:-true}"
RUN_TRACKING_GOVERNANCE="${RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE:-true}"
RUN_TRACKING_GOVERNANCE_STRICT="${RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT:-false}"
RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES="${RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES:-}"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK="${RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK:-true}"
RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY="${RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY:-false}"
SUMMARY_PATH="${RELEASE_AUTOMATION_SUMMARY_PATH:-}"
CONTINUE_ON_ERROR="${RELEASE_AUTOMATION_CONTINUE_ON_ERROR:-false}"
DRY_RUN="${RELEASE_AUTOMATION_DRY_RUN:-false}"
CLIENT_RELEASE_ID="${RELEASE_AUTOMATION_CLIENT_RELEASE_ID:-REL-CLIENT-CHECKLIST}"
CLIENT_ARTIFACT_DIR="${RELEASE_AUTOMATION_CLIENT_ARTIFACT_DIR:-/tmp/ielts-client-artifact}"
CLIENT_PUBLISH_DIR="${RELEASE_AUTOMATION_CLIENT_PUBLISH_DIR:-/tmp/ielts-client-publish}"
CLIENT_PUBLISH_ROOT="${RELEASE_AUTOMATION_CLIENT_PUBLISH_ROOT:-/tmp/ielts-client-published}"
SCRIPT_START_EPOCH="$(date +%s)"
FAILED_STEP=""
FAILED_STEPS=()
HAS_FAILURES=false
CONTINUE_ON_ERROR_ENABLED=false
DRY_RUN_ENABLED=false
TRACKING_GOVERNANCE_STRICT_ENABLED=false
TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_ENABLED=false
SUMMARY_EMITTED=false
SUMMARY_STEPS=()

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\t/\\t/g' | tr '\n' ' '
}

append_step_summary() {
  local name="$1"
  local status="$2"
  local duration_seconds="$3"
  local detail="${4:-}"
  local escaped_name escaped_detail detail_fragment

  escaped_name="$(json_escape "$name")"
  detail_fragment=""
  if [[ -n "$detail" ]]; then
    escaped_detail="$(json_escape "$detail")"
    detail_fragment=",\"detail\":\"$escaped_detail\""
  fi

  SUMMARY_STEPS+=("{\"name\":\"$escaped_name\",\"status\":\"$status\",\"duration_seconds\":${duration_seconds}${detail_fragment}}")
}

emit_summary() {
  local exit_code=$?
  if [[ "$SUMMARY_EMITTED" == "true" ]]; then
    return
  fi
  SUMMARY_EMITTED=true
  set +e

  local total_duration overall_status steps_json summary_json escaped_failed_step failed_steps_json
  total_duration=$(( $(date +%s) - SCRIPT_START_EPOCH ))
  overall_status="passed"
  if [[ "$exit_code" -ne 0 || "$HAS_FAILURES" == "true" ]]; then
    overall_status="failed"
  fi
  steps_json="$(IFS=,; echo "${SUMMARY_STEPS[*]-}")"
  escaped_failed_step="$(json_escape "$FAILED_STEP")"
  failed_steps_json=""
  if [[ "${#FAILED_STEPS[@]}" -gt 0 ]]; then
    local failed_steps_parts=()
    local failed_step_name escaped_failed_step_name
    for failed_step_name in "${FAILED_STEPS[@]}"; do
      escaped_failed_step_name="$(json_escape "$failed_step_name")"
      failed_steps_parts+=("\"${escaped_failed_step_name}\"")
    done
    failed_steps_json="$(IFS=,; echo "${failed_steps_parts[*]-}")"
  fi
  local strict_warning_codes_escaped
  strict_warning_codes_escaped="$(json_escape "$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES")"
  summary_json="{\"status\":\"$overall_status\",\"failed_step\":\"$escaped_failed_step\",\"failed_steps\":[${failed_steps_json}],\"continue_on_error\":${CONTINUE_ON_ERROR_ENABLED},\"dry_run\":${DRY_RUN_ENABLED},\"tracking_governance_strict\":${TRACKING_GOVERNANCE_STRICT_ENABLED},\"tracking_governance_strict_warning_codes\":\"${strict_warning_codes_escaped}\",\"tracking_governance_strict_codes_require_non_empty\":${TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_ENABLED},\"total_duration_seconds\":${total_duration},\"steps\":[${steps_json}]}"

  echo "[release-check] summary-json ${summary_json}"
  if [[ -n "$SUMMARY_PATH" ]]; then
    mkdir -p "$(dirname "$SUMMARY_PATH")"
    printf '%s\n' "$summary_json" > "$SUMMARY_PATH"
    echo "[release-check] summary-file ${SUMMARY_PATH}"
  fi
}
trap emit_summary EXIT

run_step() {
  local name="$1"
  shift
  local command_line="$*"
  local step_start step_duration
  if [[ "$DRY_RUN_ENABLED" == "true" ]]; then
    append_step_summary "$name" "dry_run" "0" "$command_line"
    echo "[release-check] DRY-RUN ${name} (${command_line})"
    return 0
  fi

  step_start="$(date +%s)"
  echo "[release-check] START ${name}"
  if "$@"; then
    step_duration=$(( $(date +%s) - step_start ))
    append_step_summary "$name" "passed" "$step_duration" "$command_line"
    echo "[release-check] PASS  ${name}"
    return 0
  fi

  step_duration=$(( $(date +%s) - step_start ))
  append_step_summary "$name" "failed" "$step_duration" "$command_line"
  echo "[release-check] FAIL  ${name}"
  return 1
}

skip_step() {
  local name="$1"
  local reason="$2"
  append_step_summary "$name" "skipped" "0" "$reason"
  echo "[release-check] SKIP  ${name} (${reason})"
}

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

execute_step() {
  local name="$1"
  shift
  if run_step "$name" "$@"; then
    return 0
  fi

  HAS_FAILURES=true
  if [[ -z "$FAILED_STEP" ]]; then
    FAILED_STEP="$name"
  fi
  FAILED_STEPS+=("$name")

  if [[ "$CONTINUE_ON_ERROR_ENABLED" == "true" ]]; then
    echo "[release-check] CONTINUE ${name} (RELEASE_AUTOMATION_CONTINUE_ON_ERROR=true)"
    return 0
  fi
  return 1
}

if is_truthy "$CONTINUE_ON_ERROR"; then
  CONTINUE_ON_ERROR_ENABLED=true
fi

if is_truthy "$DRY_RUN"; then
  DRY_RUN_ENABLED=true
fi

if is_truthy "$RUN_TRACKING_GOVERNANCE_STRICT"; then
  TRACKING_GOVERNANCE_STRICT_ENABLED=true
fi

if is_truthy "$RUN_TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY"; then
  TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_ENABLED=true
fi

echo "[release-check] mode continue_on_error=${CONTINUE_ON_ERROR_ENABLED}"
echo "[release-check] mode dry_run=${DRY_RUN_ENABLED}"
echo "[release-check] mode tracking_governance_strict=${TRACKING_GOVERNANCE_STRICT_ENABLED}"
if [[ -n "$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES" ]]; then
  echo "[release-check] mode tracking_governance_strict_warning_codes=${RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES}"
fi
echo "[release-check] mode tracking_governance_strict_codes_require_non_empty=${TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_ENABLED}"

execute_step "typecheck" npm run typecheck
execute_step "unit-integration-tests" npm test
execute_step "tracking-validate" bash docs/tracking/scripts/validate_tracking.sh
execute_step "tracking-status-summary" bash docs/tracking/scripts/status_summary.sh
if is_truthy "$RUN_TRACKING_GOVERNANCE"; then
  if [[ "$TRACKING_GOVERNANCE_STRICT_ENABLED" == "true" ]] && is_truthy "$RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK"; then
    execute_step "tracking-governance-strict-codes-check" env TRACKING_GOVERNANCE_STRICT_WARNING_CODES="$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES" TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY="$TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY_ENABLED" npm run validate:tracking-governance:strict-codes
  else
    skip_step "tracking-governance-strict-codes-check" "strict disabled or RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE_STRICT_CODES_CHECK=false"
  fi
  execute_step "tracking-governance-validate" env TRACKING_GOVERNANCE_STRICT="$TRACKING_GOVERNANCE_STRICT_ENABLED" TRACKING_GOVERNANCE_STRICT_WARNING_CODES="$RUN_TRACKING_GOVERNANCE_STRICT_WARNING_CODES" npm run validate:tracking-governance
else
  skip_step "tracking-governance-strict-codes-check" "RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE=false"
  skip_step "tracking-governance-validate" "RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE=false"
fi

if is_truthy "$RUN_E2E"; then
  execute_step "client-e2e-local" npm run smoke:e2e:api-local
else
  skip_step "client-e2e-local" "RELEASE_AUTOMATION_RUN_E2E=false"
fi

if is_truthy "$RUN_POSTGRES_SMOKE"; then
  execute_step "postgres-e2e-local-smoke" npm run smoke:postgres:e2e-local
else
  skip_step "postgres-e2e-local-smoke" "RELEASE_AUTOMATION_RUN_POSTGRES_SMOKE=false"
fi

if is_truthy "$RUN_FRONTEND_FULL_E2E"; then
  execute_step "frontend-full-e2e-local" npm run smoke:e2e:frontend-full-local
else
  skip_step "frontend-full-e2e-local" "RELEASE_AUTOMATION_RUN_FRONTEND_FULL_E2E=false"
fi

if is_truthy "$RUN_CLIENT_ARTIFACT"; then
  execute_step "client-artifact-build" npm run client:artifact -- --release_id "$CLIENT_RELEASE_ID" --out_dir "$CLIENT_ARTIFACT_DIR" --overwrite true
else
  skip_step "client-artifact-build" "RELEASE_AUTOMATION_RUN_CLIENT_ARTIFACT=false"
fi

if is_truthy "$RUN_CLIENT_PUBLISH"; then
  execute_step "client-publish-local" npm run client:publish -- --artifact_dir "$CLIENT_ARTIFACT_DIR" --out_dir "$CLIENT_PUBLISH_DIR" --publish_root "$CLIENT_PUBLISH_ROOT" --overwrite true
else
  skip_step "client-publish-local" "RELEASE_AUTOMATION_RUN_CLIENT_PUBLISH=false"
fi

if is_truthy "$RUN_SCRIPT_TESTS"; then
  execute_step "release-script-tests" npm run test:release-scripts
else
  skip_step "release-script-tests" "RELEASE_AUTOMATION_RUN_SCRIPT_TESTS=false"
fi

if [[ "$HAS_FAILURES" == "true" ]]; then
  echo "[release-check] completed with failures: ${FAILED_STEPS[*]}"
  exit 1
fi

echo "[release-check] all required checks passed"
