#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <id> <new_status> <owner> [sprint]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
TRACKING_ROOT="${TRACKING_ROOT:-$ROOT_DIR}"
BACKLOG_FILE="$TRACKING_ROOT/backlog.csv"
LOG_SCRIPT="$ROOT_DIR/scripts/log_activity.sh"
GOVERNANCE_SCRIPT="$PROJECT_ROOT/scripts/tracking-governance-validate.mjs"
GOVERNANCE_FIX_TEMPLATE_SCRIPT="$PROJECT_ROOT/scripts/tracking-governance-fix-template.sh"
GOVERNANCE_ENFORCE="${TRACKING_STATUS_ENFORCE_GOVERNANCE:-false}"

ID="$1"
NEW_STATUS="$2"
OWNER="$3"
SPRINT="${4:-}"

case "$NEW_STATUS" in
  Draft|Ready|"In Progress"|"In QA"|Done|Released|Blocked) ;;
  *)
    echo "ERROR: invalid status '$NEW_STATUS'"
    exit 1
    ;;
esac

CURRENT_STATUS="$(awk -F',' -v id="$ID" 'NR>1 && $1==id {print $6}' "$BACKLOG_FILE")"
if [[ -z "$CURRENT_STATUS" ]]; then
  echo "ERROR: ID not found: $ID"
  exit 1
fi
CURRENT_SPRINT="$(awk -F',' -v id="$ID" 'NR>1 && $1==id {print $7}' "$BACKLOG_FILE")"
TARGET_SPRINT="$CURRENT_SPRINT"
if [[ -n "$SPRINT" ]]; then
  TARGET_SPRINT="$SPRINT"
fi

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

governance_precheck() {
  local to_status="$1"
  local sprint="$2"

  if [[ "$to_status" != "Done" && "$to_status" != "Released" ]]; then
    return 0
  fi
  if [[ ! "$sprint" =~ ^S[0-9]+$ ]]; then
    return 0
  fi

  if [[ ! -f "$GOVERNANCE_SCRIPT" ]]; then
    echo "[set-status] WARN: governance validator not found: $GOVERNANCE_SCRIPT"
    if is_truthy "$GOVERNANCE_ENFORCE"; then
      echo "ERROR: governance precheck failed and TRACKING_STATUS_ENFORCE_GOVERNANCE=true"
      exit 1
    fi
    return 0
  fi

  local timestamp summary_path output rc
  timestamp="$(date +%Y%m%d-%H%M%S)"
  summary_path="/tmp/ielts-tracking-governance-${sprint}-${timestamp}.json"

  set +e
  output="$(
    node "$GOVERNANCE_SCRIPT" \
      --tracking_root "$TRACKING_ROOT" \
      --sprint "$sprint" \
      --summary "$summary_path" \
      2>&1
  )"
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    return 0
  fi

  local issues_count="unknown"
  if [[ -f "$summary_path" ]]; then
    issues_count="$(
      node - "$summary_path" <<'NODE'
const fs = require("node:fs");
const summaryPath = process.argv[2];
try {
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const issuesCount = summary.issues_count ?? (Array.isArray(summary.issues) ? summary.issues.length : 0);
  console.log(String(issuesCount));
} catch {
  console.log("unknown");
}
NODE
    )"
  fi

  echo "[set-status] WARN: governance precheck found ${issues_count} issue(s) for ${ID} -> ${to_status} (${sprint})"
  if [[ -f "$summary_path" ]]; then
    node - "$summary_path" <<'NODE'
const fs = require("node:fs");
const summaryPath = process.argv[2];
try {
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const details = Array.isArray(summary.issue_details) ? summary.issue_details : [];
for (const issue of details) {
  const code = issue.code || "TG000";
  const message = issue.message || "";
  console.log(`[set-status] WARN: - [${code}] ${message}`);
}
const actions = Array.isArray(summary.recommended_actions) ? summary.recommended_actions : [];
for (const action of actions) {
  console.log(`[set-status] WARN: - action: ${action}`);
}
} catch (error) {
  console.log(`[set-status] WARN: - unable to parse governance summary: ${error.message}`);
}
NODE
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      echo "[set-status] WARN: - ${line}"
    done <<< "$output"
  fi
  echo "[set-status] WARN: governance summary: ${summary_path}"
  echo "[set-status] WARN: suggested command: npm run validate:tracking-governance -- --sprint ${sprint}"
  echo "[set-status] WARN: suggested command: bash scripts/tracking-governance-fix-template.sh --summary ${summary_path}"
  if [[ ! -f "$GOVERNANCE_FIX_TEMPLATE_SCRIPT" ]]; then
    echo "[set-status] WARN: fix-template script not found: ${GOVERNANCE_FIX_TEMPLATE_SCRIPT}"
  fi

  if is_truthy "$GOVERNANCE_ENFORCE"; then
    echo "ERROR: governance precheck failed and TRACKING_STATUS_ENFORCE_GOVERNANCE=true"
    exit 1
  fi
}

governance_precheck "$NEW_STATUS" "$TARGET_SPRINT"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP_FILE="$(mktemp)"

awk -F',' -v OFS=',' -v id="$ID" -v status="$NEW_STATUS" -v owner="$OWNER" -v sprint="$SPRINT" -v ts="$TIMESTAMP" '
NR==1 { print; next }
{
  if ($1==id) {
    $6=status
    $8=owner
    if (sprint != "") {
      $7=sprint
    }
    $13=ts
  }
  print
}
' "$BACKLOG_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$BACKLOG_FILE"
TRACKING_ROOT="$TRACKING_ROOT" bash "$LOG_SCRIPT" "$ID" "$CURRENT_STATUS" "$NEW_STATUS" "$OWNER" "status updated via set_status.sh"

echo "OK: ${ID} ${CURRENT_STATUS} -> ${NEW_STATUS}"
