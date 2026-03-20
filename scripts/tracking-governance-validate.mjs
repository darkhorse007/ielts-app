#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const defaults = {
  tracking_root: "docs/tracking",
  summary: "",
  sprint: "",
  strict: "",
  strict_warning_codes: ""
};
const SUPPORTED_WARNING_CODES = ["TGW001", "TGW002", "TGW003"];
const COMPLETE_STATUSES = new Set(["Done", "Released"]);

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

const isTruthy = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "on";
};

const parseStrictWarningCodes = (raw) =>
  [...new Set(
    String(raw ?? "")
      .split(/[,\s;]+/)
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length > 0)
  )];

const shouldPromoteWarning = (warningCode, strictMode, strictWarningCodes) => {
  if (!strictMode) {
    return false;
  }
  if (strictWarningCodes.length === 0 || strictWarningCodes.includes("*")) {
    return true;
  }
  return strictWarningCodes.includes(warningCode);
};

const splitCsvLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
};

const parseCsv = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8").replace(/\r/g, "");
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });
};

const parseLatestReleaseDate = (releasesPath) => {
  const content = fs.readFileSync(releasesPath, "utf8");
  const lines = content.split(/\r?\n/);
  let latestDate = "";
  for (const line of lines) {
    if (!/^\|\s*REL-\d+\s*\|/.test(line)) {
      continue;
    }
    const columns = line.split("|").map((column) => column.trim());
    const date = columns[2] ?? "";
    if (date > latestDate) {
      latestDate = date;
    }
  }
  return latestDate;
};

const maxValue = (values) => values.reduce((max, value) => (value > max ? value : max), "");

const sprintToNumber = (sprint) => Number(sprint.slice(1));

const writeSummary = (summaryPath, summary) => {
  if (!summaryPath) {
    return;
  }
  const resolved = path.resolve(summaryPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`[tracking-governance] summary-file ${resolved}`);
};

const fail = (message, summaryPath, summary) => {
  console.error(`[tracking-governance] ERROR: ${message}`);
  writeSummary(summaryPath, summary);
  process.exit(1);
};

const buildRecommendedActions = (issueDetails, warningDetails = []) => {
  const actions = new Set();
  const allFindings = [...issueDetails, ...warningDetails];
  for (const issue of allFindings) {
    switch (issue.code) {
      case "TG003":
        actions.add("create missing sprint execution file under docs/tracking/sprints/");
        break;
      case "TG004":
        actions.add("create the missing retrospective file from docs/tracking/templates/retro-template.md");
        break;
      case "TG005":
        actions.add("add Action Items section into retrospective files");
        break;
      case "TG006":
        actions.add("append missing sprint rows into docs/tracking/metrics-weekly.csv");
        break;
      case "TG007":
        actions.add("append activity log records for the target sprint ids");
        break;
      case "TG008":
        actions.add("resolve releases.md format and ensure release rows include date column");
        break;
      case "TG009":
        actions.add("update metrics-weekly updated_at to match or exceed latest release date");
        break;
      case "TG010":
        actions.add("refresh docs/tracking/risk-register.csv updated_at to latest release date");
        break;
      case "TG011":
        actions.add("append missing status transition records into docs/tracking/activity-log.csv");
        break;
      case "TG012":
        actions.add("verify sprint id and ensure backlog rows use format S<number>");
        break;
      case "TG013":
        actions.add("ensure target sprint has backlog items before running sprint self-check");
        break;
      case "TG014":
      case "TGW001":
        actions.add("append activity log records for the target sprint ids");
        break;
      case "TGW002":
        actions.add("use supported strict warning codes (e.g. TGW001) or '*' to promote all warnings in strict mode");
        break;
      case "TGW003":
        actions.add("update backlog.csv Epic statuses to match child Story completion roll-up (mark Epic Done only when all child Stories are completed)");
        break;
      default:
        break;
    }
  }
  if (issueDetails.length > 0) {
    actions.add("rerun: npm run validate:tracking-governance");
  } else if (warningDetails.length > 0) {
    actions.add("optional strict check: npm run validate:tracking-governance -- --strict true");
  }
  return [...actions];
};

const main = () => {
  const args = parseArgs();
  const trackingRoot = path.resolve(args.tracking_root || process.env.TRACKING_GOVERNANCE_ROOT || defaults.tracking_root);
  const summaryPath = args.summary || process.env.TRACKING_GOVERNANCE_SUMMARY_PATH || "";
  const targetSprint = args.sprint || process.env.TRACKING_GOVERNANCE_SPRINT || "";
  const strictMode = isTruthy(args.strict || process.env.TRACKING_GOVERNANCE_STRICT || "false");
  const strictWarningCodes = parseStrictWarningCodes(
    args.strict_warning_codes || process.env.TRACKING_GOVERNANCE_STRICT_WARNING_CODES || defaults.strict_warning_codes
  );
  const strictWarningCodesUnknown = strictWarningCodes.filter(
    (code) => code !== "*" && !SUPPORTED_WARNING_CODES.includes(code)
  );
  const sprintMode = targetSprint !== "";

  const backlogPath = path.join(trackingRoot, "backlog.csv");
  const activityPath = path.join(trackingRoot, "activity-log.csv");
  const riskPath = path.join(trackingRoot, "risk-register.csv");
  const metricsPath = path.join(trackingRoot, "metrics-weekly.csv");
  const releasesPath = path.join(trackingRoot, "releases.md");
  const sprintDir = path.join(trackingRoot, "sprints");
  const retroDir = path.join(trackingRoot, "retrospectives");

  const requiredPaths = [
    backlogPath,
    activityPath,
    riskPath,
    metricsPath,
    releasesPath,
    sprintDir,
    retroDir
  ];
  const missingPaths = requiredPaths.filter((requiredPath) => !fs.existsSync(requiredPath));
  if (missingPaths.length > 0) {
    const issueDetails = missingPaths.map((missingPath) => ({
      code: "TG001",
      message: `missing path: ${missingPath}`
    }));
    const summary = {
      status: "failed",
      mode: sprintMode ? "sprint_self_check" : "global",
      sprint: targetSprint,
      strict_mode: strictMode,
      strict_warning_codes: strictWarningCodes,
      strict_warning_codes_unknown: strictWarningCodesUnknown,
      supported_warning_codes: SUPPORTED_WARNING_CODES,
      strict_promoted_warning_codes: [],
      checked_at: new Date().toISOString(),
      issues_count: issueDetails.length,
      issue_details: issueDetails,
      issues: issueDetails.map((issue) => issue.message),
      warnings_count: 0,
      warning_details: [],
      warnings: [],
      recommended_actions: buildRecommendedActions(issueDetails)
    };
    fail(`required tracking paths missing (${missingPaths.length})`, summaryPath, summary);
  }

  const backlog = parseCsv(backlogPath);
  const metrics = parseCsv(metricsPath);
  const risks = parseCsv(riskPath);
  const activity = parseCsv(activityPath);
  const epicRows = backlog.filter((row) => row.type === "Epic");
  const storyRows = backlog.filter((row) => row.type === "Story");
  const storiesByEpicId = new Map();
  for (const story of storyRows) {
    if (!story.parent_id) {
      continue;
    }
    const current = storiesByEpicId.get(story.parent_id) ?? [];
    current.push(story);
    storiesByEpicId.set(story.parent_id, current);
  }

  const completedSprintsSet = new Set();
  for (const row of backlog) {
    if (row.type === "Story" && row.status === "Done" && /^S\d+$/.test(row.sprint)) {
      completedSprintsSet.add(row.sprint);
    }
  }
  const completedSprints = [...completedSprintsSet].sort((left, right) => sprintToNumber(left) - sprintToNumber(right));

  const issueDetails = [];
  const warningDetails = [];
  const addIssue = (code, message, sprint = "") => {
    issueDetails.push({ code, message, sprint });
  };
  const addWarning = (code, message, sprint = "") => {
    warningDetails.push({ code, message, sprint });
  };

  if (strictWarningCodesUnknown.length > 0) {
    addWarning(
      "TGW002",
      `unknown strict warning code(s): ${strictWarningCodesUnknown.join(", ")}; supported codes: ${SUPPORTED_WARNING_CODES.join(", ")}`
    );
  }

  let selectedSprints = completedSprints;
  if (sprintMode) {
    if (!/^S\d+$/.test(targetSprint)) {
      addIssue("TG012", `invalid sprint format: ${targetSprint}`, targetSprint);
    } else {
      selectedSprints = [targetSprint];
      const sprintRows = backlog.filter((row) => row.sprint === targetSprint);
      if (sprintRows.length === 0) {
        addIssue("TG013", `sprint not found in backlog.csv: ${targetSprint}`, targetSprint);
      }
    }
  } else if (completedSprints.length === 0) {
    addIssue("TG002", "no completed story sprints found in backlog.csv");
  }

  const metricsSprintSet = new Set(metrics.map((row) => row.sprint).filter((value) => /^S\d+$/.test(value)));
  const missingSprintDocs = [];
  const missingRetroDocs = [];
  const missingActionItemsSection = [];
  const missingMetricsRows = [];
  const missingActivitySprints = [];
  const epicStatusRollupWarnings = [];

  for (const sprint of selectedSprints) {
    const sprintFile = path.join(sprintDir, `${sprint}.md`);
    const retroFile = path.join(retroDir, `${sprint}.md`);
    if (!fs.existsSync(sprintFile)) {
      missingSprintDocs.push(sprint);
      addIssue("TG003", `missing sprint file: ${sprint}`, sprint);
    }
    if (!fs.existsSync(retroFile)) {
      missingRetroDocs.push(sprint);
      addIssue("TG004", `missing retrospective file: ${sprint}`, sprint);
    } else {
      const retroContent = fs.readFileSync(retroFile, "utf8");
      if (!retroContent.includes("Action Items")) {
        missingActionItemsSection.push(sprint);
        addIssue("TG005", `retrospective missing Action Items section: ${sprint}`, sprint);
      }
    }
    if (!metricsSprintSet.has(sprint)) {
      missingMetricsRows.push(sprint);
      addIssue("TG006", `missing metrics-weekly row for sprint: ${sprint}`, sprint);
    }
    const sprintIds = new Set(backlog.filter((row) => row.sprint === sprint).map((row) => row.id));
    const hasActivity = activity.some((row) => sprintIds.has(row.id) || row.id.startsWith(`${sprint}-`));
    if (!hasActivity) {
      missingActivitySprints.push(sprint);
      if (sprintMode) {
        addIssue("TG007", `missing activity-log records for sprint: ${sprint}`, sprint);
      } else {
        addWarning("TGW001", `missing activity-log records for sprint: ${sprint}`, sprint);
      }
    }
  }

  for (const epic of epicRows) {
    const childStories = storiesByEpicId.get(epic.id) ?? [];
    if (childStories.length === 0) {
      continue;
    }

    const completedStoryCount = childStories.filter((story) => COMPLETE_STATUSES.has(story.status)).length;
    const allChildStoriesCompleted = completedStoryCount === childStories.length;
    const epicMarkedDone = epic.status === "Done";
    if (allChildStoriesCompleted === epicMarkedDone) {
      continue;
    }

    epicStatusRollupWarnings.push({
      epic_id: epic.id,
      epic_title: epic.title,
      epic_status: epic.status,
      child_story_total_count: childStories.length,
      child_story_completed_count: completedStoryCount,
      all_child_stories_completed: allChildStoriesCompleted
    });

    if (allChildStoriesCompleted) {
      addWarning(
        "TGW003",
        `epic status drift: ${epic.id} is ${epic.status} but all ${childStories.length} child stories are completed`,
        epic.sprint
      );
    } else {
      addWarning(
        "TGW003",
        `epic status drift: ${epic.id} is Done but only ${completedStoryCount}/${childStories.length} child stories are completed`,
        epic.sprint
      );
    }
  }

  const strictPromotedWarningCodes = [];
  if (strictMode && warningDetails.length > 0) {
    for (const warning of warningDetails) {
      if (!shouldPromoteWarning(warning.code, strictMode, strictWarningCodes)) {
        continue;
      }
      strictPromotedWarningCodes.push(warning.code);
      addIssue("TG014", `strict mode promoted warning (${warning.code}): ${warning.message}`, warning.sprint || "");
    }
  }

  const latestReleaseDate = parseLatestReleaseDate(releasesPath);
  const maxMetricsUpdatedAt = maxValue(metrics.map((row) => row.updated_at || ""));
  const maxRiskUpdatedAt = maxValue(risks.map((row) => row.updated_at || ""));
  const maxActivityDate = maxValue(activity.map((row) => (row.timestamp || "").slice(0, 10)));

  if (!sprintMode) {
    if (!latestReleaseDate) {
      addIssue("TG008", "unable to resolve latest release date from releases.md");
    } else {
      if (maxMetricsUpdatedAt < latestReleaseDate) {
        addIssue("TG009", `metrics-weekly outdated: max updated_at=${maxMetricsUpdatedAt || "none"} < latest release date=${latestReleaseDate}`);
      }
      if (maxRiskUpdatedAt < latestReleaseDate) {
        addIssue("TG010", `risk-register outdated: max updated_at=${maxRiskUpdatedAt || "none"} < latest release date=${latestReleaseDate}`);
      }
      if (maxActivityDate < latestReleaseDate) {
        addIssue("TG011", `activity-log outdated: max timestamp date=${maxActivityDate || "none"} < latest release date=${latestReleaseDate}`);
      }
    }
  }

  const issues = issueDetails.map((issue) => issue.message);
  const warnings = warningDetails.map((warning) => warning.message);
  const summary = {
    status: issueDetails.length === 0 ? "passed" : "failed",
    mode: sprintMode ? "sprint_self_check" : "global",
    sprint: targetSprint,
    strict_mode: strictMode,
    strict_warning_codes: strictWarningCodes,
    strict_warning_codes_unknown: strictWarningCodesUnknown,
    supported_warning_codes: SUPPORTED_WARNING_CODES,
    strict_promoted_warning_codes: strictPromotedWarningCodes,
    checked_at: new Date().toISOString(),
    tracking_root: trackingRoot,
    latest_release_date: latestReleaseDate,
    max_metrics_updated_at: maxMetricsUpdatedAt,
    max_risk_updated_at: maxRiskUpdatedAt,
    max_activity_date: maxActivityDate,
    completed_sprints: completedSprints,
    selected_sprints: selectedSprints,
    missing_sprint_docs: missingSprintDocs,
    missing_retrospectives: missingRetroDocs,
    missing_retro_action_items: missingActionItemsSection,
    missing_metrics_sprints: missingMetricsRows,
    missing_activity_sprints: missingActivitySprints,
    epic_status_rollup_warnings: epicStatusRollupWarnings,
    issues_count: issueDetails.length,
    issue_details: issueDetails,
    issues,
    warnings_count: warningDetails.length,
    warning_details: warningDetails,
    warnings,
    recommended_actions: buildRecommendedActions(issueDetails, warningDetails)
  };

  writeSummary(summaryPath, summary);

  if (issueDetails.length > 0) {
    console.error("[tracking-governance] failed");
    for (const issue of issueDetails) {
      console.error(`- [${issue.code}] ${issue.message}`);
    }
    if (warningDetails.length > 0) {
      console.error("[tracking-governance] warnings:");
      for (const warning of warningDetails) {
        console.error(`- [${warning.code}] ${warning.message}`);
      }
    }
    if (summary.recommended_actions.length > 0) {
      console.error("[tracking-governance] recommended actions:");
      for (const action of summary.recommended_actions) {
        console.error(`- ${action}`);
      }
    }
    process.exit(1);
  }

  if (warningDetails.length > 0) {
    console.log("[tracking-governance] passed with warnings");
    for (const warning of warningDetails) {
      console.log(`- [${warning.code}] ${warning.message}`);
    }
  } else {
    console.log("[tracking-governance] passed");
  }
  if (sprintMode) {
    console.log(`[tracking-governance] sprint self-check: ${targetSprint}`);
  } else {
    console.log(`[tracking-governance] completed sprints: ${completedSprints.join(", ")}`);
  }
  console.log(`[tracking-governance] strict mode: ${strictMode}`);
  console.log(`[tracking-governance] latest release date: ${latestReleaseDate}`);
};

try {
  main();
} catch (error) {
  console.error(`[tracking-governance] ERROR: ${error.message}`);
  process.exit(1);
}
