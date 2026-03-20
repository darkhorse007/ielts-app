#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const defaults = {
  summary: "/tmp/release-check-summary.json",
  releases: "docs/tracking/releases.md",
  release_id: "",
  scope: "E10(S9)",
  owner: "codex",
  rollback: "待补充回滚方案",
  notes: "",
  summary_artifact: "",
  tracking_artifact: "",
  tracking_summary: "",
  out: "",
  append: "false",
  dry_run: "false"
};

const parseArgs = () => {
  const args = { ...defaults };
  const raw = process.argv.slice(2);
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = raw[index + 1];
    if (value == null || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const sanitizeMarkdownCell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();

const isTruthy = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "on";
};

const resolveNextReleaseId = (releasesContent) => {
  const matches = [...releasesContent.matchAll(/REL-(\d{3,})/g)];
  const maxId = matches.reduce((maxValue, match) => {
    const current = Number(match[1]);
    if (Number.isNaN(current)) {
      return maxValue;
    }
    return Math.max(maxValue, current);
  }, 0);
  return `REL-${String(maxId + 1).padStart(3, "0")}`;
};

const buildLocalDate = () => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const main = () => {
  const args = parseArgs();
  const summaryPath = path.resolve(args.summary);
  const releasesPath = path.resolve(args.releases);

  if (!fs.existsSync(summaryPath)) {
    throw new Error(`summary file not found: ${summaryPath}`);
  }
  if (!fs.existsSync(releasesPath)) {
    throw new Error(`releases file not found: ${releasesPath}`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const releasesContent = fs.readFileSync(releasesPath, "utf8");
  const releaseId = args.release_id ? String(args.release_id) : resolveNextReleaseId(releasesContent);
  const date = buildLocalDate();
  const gateResult = summary.status === "passed" ? "PASS（演练环境）" : "FAIL（演练环境）";
  const failedSteps = Array.isArray(summary.failed_steps) && summary.failed_steps.length > 0
    ? summary.failed_steps.join(";")
    : "none";

  const summaryNotes = [
    `summary=${summary.status ?? "unknown"}`,
    `failed_step=${summary.failed_step || "none"}`,
    `failed_steps=${failedSteps}`,
    `continue_on_error=${String(Boolean(summary.continue_on_error))}`,
    `dry_run=${String(Boolean(summary.dry_run))}`,
    `tracking_governance_strict=${String(Boolean(summary.tracking_governance_strict))}`,
    `duration=${summary.total_duration_seconds ?? 0}s`
  ].join("; ");

  let trackingNotes = "";
  if (args.tracking_summary) {
    const trackingSummaryPath = path.resolve(args.tracking_summary);
    if (!fs.existsSync(trackingSummaryPath)) {
      throw new Error(`tracking summary file not found: ${trackingSummaryPath}`);
    }
    const trackingSummary = JSON.parse(fs.readFileSync(trackingSummaryPath, "utf8"));
    const missingRetros = Array.isArray(trackingSummary.missing_retrospectives)
      ? trackingSummary.missing_retrospectives.length
      : 0;
    const missingMetrics = Array.isArray(trackingSummary.missing_metrics_sprints)
      ? trackingSummary.missing_metrics_sprints.length
      : 0;
    const completedSprints = Array.isArray(trackingSummary.completed_sprints)
      ? trackingSummary.completed_sprints.length
      : 0;
    const warningsCount = Number.isFinite(Number(trackingSummary.warnings_count))
      ? Number(trackingSummary.warnings_count)
      : 0;
    const strictMode = Boolean(trackingSummary.strict_mode);
    const strictWarningCodes = Array.isArray(trackingSummary.strict_warning_codes) && trackingSummary.strict_warning_codes.length > 0
      ? trackingSummary.strict_warning_codes.join(",")
      : "none";
    const strictWarningCodesUnknown =
      Array.isArray(trackingSummary.strict_warning_codes_unknown) && trackingSummary.strict_warning_codes_unknown.length > 0
        ? trackingSummary.strict_warning_codes_unknown.join(",")
        : "none";
    const strictPromotedWarningCodes =
      Array.isArray(trackingSummary.strict_promoted_warning_codes) && trackingSummary.strict_promoted_warning_codes.length > 0
        ? trackingSummary.strict_promoted_warning_codes.join(",")
        : "none";
    trackingNotes = [
      `tracking_status=${trackingSummary.status ?? "unknown"}`,
      `tracking_completed_sprints=${completedSprints}`,
      `tracking_missing_retros=${missingRetros}`,
      `tracking_missing_metrics=${missingMetrics}`,
      `tracking_warnings=${warningsCount}`,
      `tracking_strict_mode=${strictMode}`,
      `tracking_strict_warning_codes=${strictWarningCodes}`,
      `tracking_strict_warning_codes_unknown=${strictWarningCodesUnknown}`,
      `tracking_strict_promoted_warning_codes=${strictPromotedWarningCodes}`
    ].join("; ");
  }

  const notesParts = [summaryNotes];
  if (trackingNotes) {
    notesParts.push(trackingNotes);
  }
  if (args.summary_artifact) {
    notesParts.push(`summary_artifact=${args.summary_artifact}`);
  }
  if (args.tracking_artifact) {
    notesParts.push(`tracking_artifact=${args.tracking_artifact}`);
  }
  if (args.notes) {
    notesParts.push(args.notes);
  }
  const mergedNotes = notesParts.join("; ");
  const row = `| ${releaseId} | ${date} | ${sanitizeMarkdownCell(args.scope)} | ${gateResult} | ${sanitizeMarkdownCell(args.owner)} | ${sanitizeMarkdownCell(args.rollback)} | ${sanitizeMarkdownCell(mergedNotes)} |`;

  const appendEnabled = isTruthy(args.append);
  const dryRunEnabled = isTruthy(args.dry_run);

  if (appendEnabled) {
    if (!releasesContent.includes("## 发布记录表")) {
      throw new Error(`invalid releases markdown format: ${releasesPath}`);
    }
    if (releasesContent.includes(`| ${releaseId} |`)) {
      throw new Error(`release id already exists: ${releaseId}`);
    }

    if (dryRunEnabled) {
      console.log(`[dry-run] would append release row to ${releasesPath}`);
    } else {
      const suffix = releasesContent.endsWith("\n") ? "" : "\n";
      fs.writeFileSync(releasesPath, `${releasesContent}${suffix}${row}\n`, "utf8");
      console.log(`release row appended to ${releasesPath}`);
    }
  }

  if (args.out) {
    const outputPath = path.resolve(args.out);
    if (dryRunEnabled) {
      console.log(`[dry-run] would write release row to ${outputPath}`);
    } else {
      fs.writeFileSync(outputPath, `${row}\n`, "utf8");
      console.log(`release row written to ${outputPath}`);
    }
  }

  console.log(row);
};

try {
  main();
} catch (error) {
  console.error(`[release-record-candidate] ${error.message}`);
  process.exit(1);
}
