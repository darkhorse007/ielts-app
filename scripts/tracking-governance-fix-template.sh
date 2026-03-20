#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --summary <tracking-governance-summary.json> [--output_dir <dir>] [--tracking_root <docs/tracking>] [--dry_run true|false] [--output_format text|json] [--out <path>]"
}

SUMMARY_PATH=""
OUTPUT_DIR=""
TRACKING_ROOT_OVERRIDE=""
DRY_RUN="${TRACKING_GOVERNANCE_FIX_TEMPLATE_DRY_RUN:-false}"
OUTPUT_FORMAT="${TRACKING_GOVERNANCE_FIX_TEMPLATE_OUTPUT_FORMAT:-text}"
OUT_PATH="${TRACKING_GOVERNANCE_FIX_TEMPLATE_OUT:-}"

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary)
      SUMMARY_PATH="${2:-}"
      shift 2
      ;;
    --output_dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --tracking_root)
      TRACKING_ROOT_OVERRIDE="${2:-}"
      shift 2
      ;;
    --dry_run)
      DRY_RUN="${2:-false}"
      shift 2
      ;;
    --output_format)
      OUTPUT_FORMAT="${2:-text}"
      shift 2
      ;;
    --out)
      OUT_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

case "$(echo "$OUTPUT_FORMAT" | tr '[:upper:]' '[:lower:]')" in
  text|json)
    OUTPUT_FORMAT="$(echo "$OUTPUT_FORMAT" | tr '[:upper:]' '[:lower:]')"
    ;;
  *)
    echo "ERROR: --output_format must be text or json, got: $OUTPUT_FORMAT"
    exit 1
    ;;
esac

if [[ -z "$SUMMARY_PATH" ]]; then
  echo "ERROR: --summary is required"
  usage
  exit 1
fi

if [[ ! -f "$SUMMARY_PATH" ]]; then
  echo "ERROR: summary file not found: $SUMMARY_PATH"
  exit 1
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="/tmp/ielts-tracking-governance-fix-$(date +%Y%m%d-%H%M%S)"
fi

json_array_to_lines() {
  local summary_path="$1"
  local key="$2"
  node - "$summary_path" "$key" <<'NODE'
const fs = require("node:fs");
const summaryPath = process.argv[2];
const key = process.argv[3];
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const arr = Array.isArray(summary[key]) ? summary[key] : [];
for (const item of arr) {
  if (typeof item === "string" && item.trim()) {
    console.log(item.trim());
  }
}
NODE
}

count_json_array_items() {
  local summary_path="$1"
  local key="$2"
  json_array_to_lines "$summary_path" "$key" | awk 'NF {count+=1} END {print count+0}'
}

resolve_tracking_root() {
  local summary_path="$1"
  local override="${2:-}"
  node - "$summary_path" "$override" <<'NODE'
const fs = require("node:fs");
const summaryPath = process.argv[2];
const override = process.argv[3] || "";
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
if (override.trim()) {
  console.log(override.trim());
} else if (typeof summary.tracking_root === "string" && summary.tracking_root.trim()) {
  console.log(summary.tracking_root.trim());
} else {
  console.log("docs/tracking");
}
NODE
}

create_sprint_template() {
  local sprint="$1"
  local file_path="$OUTPUT_DIR/sprints/${sprint}.md"
  cat > "$file_path" <<EOF
# Sprint ${sprint}

## 1. Sprint 目标
1. TODO: 填写本 Sprint 的核心交付目标。

## 2. 范围
| id | title | priority | status | owner | estimate |
|---|---|---|---|---|---|
| TODO | TODO | P1 | In Progress | codex | 0 |

## 3. 出口标准
1. TODO: 填写验收门槛。

## 4. 风险与阻塞
| date | risk_or_blocker | impact | owner | action | status |
|---|---|---|---|---|---|
| $(date -u +%Y-%m-%d) | TODO | 中 | codex | TODO | Open |

## 5. 每日执行日志
| date | completed | in_progress | in_qa | blocked | notes |
|---|---|---|---|---|---|
| $(date -u +%Y-%m-%d) | TODO | TODO | - | - | 由治理修复模板生成，待补充真实执行记录 |

## 6. 验收结论
1. 达成项: TODO
2. 未达成项: TODO
3. 结论: TODO
EOF
}

create_retro_template() {
  local sprint="$1"
  local file_path="$OUTPUT_DIR/retrospectives/${sprint}.md"
  cat > "$file_path" <<EOF
# Sprint Retro

## 1. Sprint 信息
- Sprint: ${sprint}
- 周期: TODO
- 主持人: codex
- 参与人: codex

## 2. 数据回顾
1. Planned Points: TODO
2. Completed Points: TODO
3. Carry-over Points: TODO
4. P0 缺陷: TODO

## 3. What Went Well
1. TODO

## 4. What Went Wrong
1. TODO

## 5. Root Causes
1. TODO

## 6. Action Items（下个 Sprint 必做）
| action | owner | due_date | related_id |
|---|---|---|---|
| TODO | codex | $(date -u +%Y-%m-%d) | TODO |
EOF
}

TRACKING_ROOT_RESOLVED="$(resolve_tracking_root "$SUMMARY_PATH" "$TRACKING_ROOT_OVERRIDE")"

DRY_RUN_ENABLED=false
if is_truthy "$DRY_RUN"; then
  DRY_RUN_ENABLED=true
fi

if [[ -n "$OUT_PATH" ]]; then
  if [[ "$DRY_RUN_ENABLED" != "true" || "$OUTPUT_FORMAT" != "json" ]]; then
    echo "ERROR: --out is only supported with --dry_run true --output_format json"
    exit 1
  fi
fi

if [[ "$DRY_RUN_ENABLED" == "true" ]]; then
  sprint_docs_count="$(count_json_array_items "$SUMMARY_PATH" "missing_sprint_docs")"
  retros_count="$(count_json_array_items "$SUMMARY_PATH" "missing_retrospectives")"
  metrics_count="$(count_json_array_items "$SUMMARY_PATH" "missing_metrics_sprints")"
  activity_count="$(count_json_array_items "$SUMMARY_PATH" "missing_activity_sprints")"

  if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    json_payload="$(
      node - "$SUMMARY_PATH" "$OUTPUT_DIR" "$TRACKING_ROOT_RESOLVED" "$sprint_docs_count" "$retros_count" "$metrics_count" "$activity_count" <<'NODE'
const fs = require("node:fs");
const summaryPath = process.argv[2];
const outputDir = process.argv[3];
const trackingRoot = process.argv[4];
const sprintTemplates = Number(process.argv[5] || 0);
const retrospectives = Number(process.argv[6] || 0);
const metricsPlaceholders = Number(process.argv[7] || 0);
const activityPlaceholders = Number(process.argv[8] || 0);
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const recommendedActions = Array.isArray(summary.recommended_actions)
  ? summary.recommended_actions.filter((item) => typeof item === "string" && item.trim().length > 0)
  : [];

const payload = {
  status: "dry_run",
  output_format: "json",
  output_dir: outputDir,
  tracking_root: trackingRoot,
  planned: {
    sprint_templates: sprintTemplates,
    retrospectives,
    metrics_placeholders: metricsPlaceholders,
    activity_placeholders: activityPlaceholders
  },
  apply_command: `bash "${outputDir}/apply-fixes.sh" "${trackingRoot}"`,
  recommended_actions: recommendedActions
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
NODE
    )"
    if [[ -n "$OUT_PATH" ]]; then
      mkdir -p "$(dirname "$OUT_PATH")"
      printf '%s\n' "$json_payload" > "$OUT_PATH"
      echo "[tracking-governance-fix-template] json-output-file $OUT_PATH"
    fi
    printf '%s\n' "$json_payload"
  else
    echo "[tracking-governance-fix-template] dry-run true"
    echo "[tracking-governance-fix-template] output-dir (planned) $OUTPUT_DIR"
    echo "[tracking-governance-fix-template] target tracking root $TRACKING_ROOT_RESOLVED"
    echo "[tracking-governance-fix-template] planned sprint templates: $sprint_docs_count"
    echo "[tracking-governance-fix-template] planned retrospectives: $retros_count"
    echo "[tracking-governance-fix-template] planned metrics placeholders: $metrics_count"
    echo "[tracking-governance-fix-template] planned activity placeholders: $activity_count"
    echo "[tracking-governance-fix-template] apply command (planned): bash \"$OUTPUT_DIR/apply-fixes.sh\" \"$TRACKING_ROOT_RESOLVED\""
  fi
  exit 0
fi

mkdir -p "$OUTPUT_DIR/sprints" "$OUTPUT_DIR/retrospectives"

while IFS= read -r sprint; do
  [[ -n "$sprint" ]] || continue
  create_sprint_template "$sprint"
done < <(json_array_to_lines "$SUMMARY_PATH" "missing_sprint_docs")

while IFS= read -r sprint; do
  [[ -n "$sprint" ]] || continue
  create_retro_template "$sprint"
done < <(json_array_to_lines "$SUMMARY_PATH" "missing_retrospectives")

METRICS_APPEND="$OUTPUT_DIR/metrics-weekly.append.csv"
ACTIVITY_APPEND="$OUTPUT_DIR/activity-log.append.csv"
: > "$METRICS_APPEND"
: > "$ACTIVITY_APPEND"

today="$(date -u +%Y-%m-%d)"
now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

while IFS= read -r sprint; do
  [[ -n "$sprint" ]] || continue
  printf "%s,%s,0,0,0,0,0,35,0,99.9,1200,120,TODO: fill metrics generated by governance fix template,%s\n" \
    "$today" "$sprint" "$today" >> "$METRICS_APPEND"
done < <(json_array_to_lines "$SUMMARY_PATH" "missing_metrics_sprints")

while IFS= read -r sprint; do
  [[ -n "$sprint" ]] || continue
  printf "%s,%s-CLOSE,In Progress,Done,codex,TODO: fill sprint close record generated by governance fix template,manual\n" \
    "$now_utc" "$sprint" >> "$ACTIVITY_APPEND"
done < <(json_array_to_lines "$SUMMARY_PATH" "missing_activity_sprints")

APPLY_SCRIPT="$OUTPUT_DIR/apply-fixes.sh"
cat > "$APPLY_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRACKING_ROOT="${1:-}"
if [[ -z "$TRACKING_ROOT" ]]; then
  echo "Usage: $0 <tracking_root>"
  exit 1
fi

mkdir -p "$TRACKING_ROOT/sprints" "$TRACKING_ROOT/retrospectives"

if compgen -G "$SCRIPT_DIR/sprints/*.md" >/dev/null; then
  for file in "$SCRIPT_DIR"/sprints/*.md; do
    target="$TRACKING_ROOT/sprints/$(basename "$file")"
    if [[ -f "$target" ]]; then
      echo "skip existing sprint doc: $target"
    else
      cp "$file" "$target"
      echo "created sprint doc: $target"
    fi
  done
fi

if compgen -G "$SCRIPT_DIR/retrospectives/*.md" >/dev/null; then
  for file in "$SCRIPT_DIR"/retrospectives/*.md; do
    target="$TRACKING_ROOT/retrospectives/$(basename "$file")"
    if [[ -f "$target" ]]; then
      echo "skip existing retro doc: $target"
    else
      cp "$file" "$target"
      echo "created retro doc: $target"
    fi
  done
fi

if [[ -s "$SCRIPT_DIR/metrics-weekly.append.csv" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    sprint="$(printf '%s' "$line" | awk -F',' '{print $2}')"
    if awk -F',' -v sprint="$sprint" 'NR>1 && $2==sprint {found=1; exit} END{exit found?0:1}' "$TRACKING_ROOT/metrics-weekly.csv"; then
      echo "skip existing metrics sprint: $sprint"
      continue
    fi
    printf '%s\n' "$line" >> "$TRACKING_ROOT/metrics-weekly.csv"
    echo "appended metrics placeholder sprint: $sprint"
  done < "$SCRIPT_DIR/metrics-weekly.append.csv"
fi

if [[ -s "$SCRIPT_DIR/activity-log.append.csv" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    id="$(printf '%s' "$line" | awk -F',' '{print $2}')"
    to_status="$(printf '%s' "$line" | awk -F',' '{print $4}')"
    if awk -F',' -v id="$id" -v to_status="$to_status" 'NR>1 && $2==id && $4==to_status {found=1; exit} END{exit found?0:1}' "$TRACKING_ROOT/activity-log.csv"; then
      echo "skip existing activity entry: $id/$to_status"
      continue
    fi
    printf '%s\n' "$line" >> "$TRACKING_ROOT/activity-log.csv"
    echo "appended activity placeholder: $id/$to_status"
  done < "$SCRIPT_DIR/activity-log.append.csv"
fi

echo "done"
EOF
chmod +x "$APPLY_SCRIPT"

FIX_STEPS="$OUTPUT_DIR/fix-steps.md"
{
  echo "# Tracking Governance Fix Steps"
  echo
  echo "## 1. Summary"
  echo "- source summary: \`$SUMMARY_PATH\`"
  echo "- target tracking root: \`$TRACKING_ROOT_RESOLVED\`"
  echo "- generated at: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
  echo
  echo "## 2. Generated Files"
  echo "- sprint templates: \`$OUTPUT_DIR/sprints/\`"
  echo "- retrospective templates: \`$OUTPUT_DIR/retrospectives/\`"
  echo "- metrics append csv: \`$METRICS_APPEND\`"
  echo "- activity append csv: \`$ACTIVITY_APPEND\`"
  echo "- apply script: \`$APPLY_SCRIPT\`"
  echo
  echo "## 3. Apply Commands"
  echo '```bash'
  echo "bash \"$APPLY_SCRIPT\" \"$TRACKING_ROOT_RESOLVED\""
  echo "npm run validate:tracking-governance"
  echo '```'
} > "$FIX_STEPS"

echo "[tracking-governance-fix-template] output-dir $OUTPUT_DIR"
echo "[tracking-governance-fix-template] fix-steps $FIX_STEPS"
