#!/usr/bin/env bash
set -euo pipefail

SUMMARY_JSON_PATH="${RELEASE_GATE_SUMMARY_PATH:-/tmp/ielts-quality-gate-summary.json}"
TRACKING_SUMMARY_PATH="${TRACKING_GOVERNANCE_SUMMARY_PATH:-/tmp/ielts-tracking-governance-summary.json}"
SCOPE="${RELEASE_RECORD_SCOPE:-E10}"
ROLLBACK="${RELEASE_RECORD_ROLLBACK:-执行 release checklist 与 tracking-governance 回滚核验}"
NOTES="${RELEASE_RECORD_NOTES:-}"
APPEND="${RELEASE_RECORD_APPEND:-true}"
DRY_RUN="${RELEASE_RECORD_DRY_RUN:-false}"
SUMMARY_ARTIFACT="${RELEASE_GATE_SUMMARY_ARTIFACT:-quality-gate-summary-json}"
TRACKING_ARTIFACT="${TRACKING_GOVERNANCE_SUMMARY_ARTIFACT:-quality-gate-tracking-governance-summary}"

if [[ ! -f "$SUMMARY_JSON_PATH" ]]; then
  echo "ERROR: summary json not found: $SUMMARY_JSON_PATH"
  exit 1
fi

cmd=(
  npm run release:record:candidate -- --summary "$SUMMARY_JSON_PATH"
  --scope "$SCOPE"
  --rollback "$ROLLBACK"
  --append "$APPEND"
  --dry_run "$DRY_RUN"
  --summary_artifact "$SUMMARY_ARTIFACT"
)

if [[ -f "$TRACKING_SUMMARY_PATH" ]]; then
  cmd+=(--tracking_summary "$TRACKING_SUMMARY_PATH")
  cmd+=(--tracking_artifact "$TRACKING_ARTIFACT")
else
  echo "[release-record-from-gate] WARN: tracking summary not found, skip --tracking_summary: $TRACKING_SUMMARY_PATH"
fi

if [[ -n "$NOTES" ]]; then
  cmd+=(--notes "$NOTES")
fi

if [[ $# -gt 0 ]]; then
  cmd+=("$@")
fi

"${cmd[@]}"
