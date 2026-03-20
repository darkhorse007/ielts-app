#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 5 ]]; then
  echo "Usage: $0 <id> <from_status> <to_status> <owner> <reason>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRACKING_ROOT="${TRACKING_ROOT:-$ROOT_DIR}"
ACTIVITY_FILE="$TRACKING_ROOT/activity-log.csv"

ID="$1"
FROM_STATUS="$2"
TO_STATUS="$3"
OWNER="$4"
shift 4
REASON="$*"
REASON="${REASON//,/;}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "${TIMESTAMP},${ID},${FROM_STATUS},${TO_STATUS},${OWNER},${REASON},manual" >> "$ACTIVITY_FILE"
echo "OK: activity appended for ${ID}"
