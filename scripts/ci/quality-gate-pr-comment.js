"use strict";

const MARKER = "<!-- quality-gate-summary-comment -->";
const DEFAULT_ABNORMAL_PRIORITY = ["typecheck", "test", "e2e", "postgres", "visual"];
const ABNORMAL_PRIORITY_TOKEN_REFERENCE = [
  {
    token: "typecheck",
    examples: ["typecheck", "typecheck-and-test"]
  },
  {
    token: "test",
    examples: ["unit-integration-tests", "release-script-tests"]
  },
  {
    token: "e2e",
    examples: ["e2e", "client-e2e-local"]
  },
  {
    token: "postgres",
    examples: ["postgres-smoke", "postgres-e2e-local-smoke"]
  },
  {
    token: "visual",
    examples: ["visual-snapshots", "visual-snapshots-e2e-local"]
  }
];

const normalizeStepName = (name) => String(name || "").trim().toLowerCase();

const isTruthy = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parsePriorityOrder = (value) => {
  const normalized = String(value ?? "")
    .split(/[,\s;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  const deduped = [];
  for (const token of normalized) {
    if (!deduped.includes(token)) {
      deduped.push(token);
    }
  }
  return deduped;
};

const parsePriorityMatchMode = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["contains", "exact"].includes(normalized)) {
    return {
      mode: normalized,
      valid: true,
      input: normalized
    };
  }
  return {
    mode: "contains",
    valid: false,
    input: normalized
  };
};

const formatTokenReference = () =>
  ABNORMAL_PRIORITY_TOKEN_REFERENCE.map((item) => `${item.token}(${item.examples.join("/")})`).join(", ");

const getAbnormalPriorityRank = (name, priorityOrder, matchMode) => {
  const normalized = normalizeStepName(name);
  for (let index = 0; index < priorityOrder.length; index += 1) {
    const token = priorityOrder[index];
    const matched = matchMode === "exact" ? normalized === token : normalized.includes(token);
    if (matched) {
      return index;
    }
  }
  return priorityOrder.length + 1;
};

const toTrackingFields = (summary) => {
  const failedSteps = Array.isArray(summary.failed_steps) ? summary.failed_steps : [];
  const tracking =
    summary.tracking_governance && typeof summary.tracking_governance === "object"
      ? summary.tracking_governance
      : {};
  const trackingStatus = typeof tracking.status === "string" ? tracking.status : "unknown";
  const trackingIssuesCount =
    Number.isInteger(tracking.issues_count) && tracking.issues_count >= 0 ? tracking.issues_count : "unknown";
  const trackingWarningsCount =
    Number.isInteger(tracking.warnings_count) && tracking.warnings_count >= 0 ? tracking.warnings_count : "unknown";
  const trackingStrictMode = typeof tracking.strict_mode === "boolean" ? tracking.strict_mode : false;
  const trackingArtifactFound = typeof tracking.artifact_found === "boolean" ? tracking.artifact_found : false;

  const strictCodesCheck =
    tracking.strict_codes_check && typeof tracking.strict_codes_check === "object" ? tracking.strict_codes_check : {};
  const strictCodesStatus = typeof strictCodesCheck.status === "string" ? strictCodesCheck.status : "unknown";
  const strictCodesMode =
    typeof strictCodesCheck.mode === "string" && strictCodesCheck.mode.trim().length > 0
      ? strictCodesCheck.mode
      : "unknown";
  const strictCodesUnknownCount =
    Number.isInteger(strictCodesCheck.unknown_count) && strictCodesCheck.unknown_count >= 0
      ? strictCodesCheck.unknown_count
      : "unknown";
  const strictCodesUnknownCodes =
    Array.isArray(strictCodesCheck.unknown_codes) && strictCodesCheck.unknown_codes.length > 0
      ? strictCodesCheck.unknown_codes.join(",")
      : "none";
  const strictCodesRequireNonEmpty =
    typeof strictCodesCheck.require_non_empty === "boolean" ? strictCodesCheck.require_non_empty : false;
  const strictCodesDurationMs =
    Number.isInteger(strictCodesCheck.duration_ms) && strictCodesCheck.duration_ms >= 0
      ? strictCodesCheck.duration_ms
      : "unknown";
  const strictCodesArtifactFound =
    typeof strictCodesCheck.artifact_found === "boolean" ? strictCodesCheck.artifact_found : false;

  return {
    failedSteps,
    trackingStatus,
    trackingIssuesCount,
    trackingWarningsCount,
    trackingStrictMode,
    trackingArtifactFound,
    strictCodesStatus,
    strictCodesMode,
    strictCodesUnknownCount,
    strictCodesUnknownCodes,
    strictCodesRequireNonEmpty,
    strictCodesDurationMs,
    strictCodesArtifactFound
  };
};

const buildQualityGateSummaryComment = ({ summary, env = process.env }) => {
  const {
    failedSteps,
    trackingStatus,
    trackingIssuesCount,
    trackingWarningsCount,
    trackingStrictMode,
    trackingArtifactFound,
    strictCodesStatus,
    strictCodesMode,
    strictCodesUnknownCount,
    strictCodesUnknownCodes,
    strictCodesRequireNonEmpty,
    strictCodesDurationMs,
    strictCodesArtifactFound
  } = toTrackingFields(summary);

  const abnormalOnly = isTruthy(env.QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY || "false");
  const abnormalMaxSteps = parsePositiveInt(env.QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS || "10", 10);
  const abnormalPriorityOrderParsed = parsePriorityOrder(
    env.QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY || DEFAULT_ABNORMAL_PRIORITY.join(",")
  );
  const abnormalPriorityOrder =
    abnormalPriorityOrderParsed.length > 0 ? abnormalPriorityOrderParsed : DEFAULT_ABNORMAL_PRIORITY;
  const abnormalPriorityMatch = parsePriorityMatchMode(env.QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH || "contains");

  const lines = [MARKER, "## quality-gate summary", ""];
  if (abnormalOnly) {
    lines.push("- comment_mode: `abnormal_only`");
    lines.push(`- abnormal_max_steps: \`${abnormalMaxSteps}\``);
    lines.push(`- abnormal_priority: \`${abnormalPriorityOrder.join(" > ")}\``);
    lines.push(`- abnormal_priority_match: \`${abnormalPriorityMatch.mode}\``);
    if (!abnormalPriorityMatch.valid) {
      lines.push(
        `- abnormal_priority_match_fallback: invalid input \`${abnormalPriorityMatch.input || "empty"}\`, fallback \`contains\``
      );
    }
    lines.push(`- abnormal_priority_reference: \`${formatTokenReference()}\``);
    lines.push(`- status: \`${summary.status || "unknown"}\``);
    lines.push(`- failed_step: \`${summary.failed_step || "none"}\``);
    lines.push(`- failed_steps: ${failedSteps.length > 0 ? failedSteps.map((step) => `\`${step}\``).join(", ") : "none"}`);
    lines.push("- artifact: `quality-gate-summary-json`");

    const abnormalLines = [];
    if ((summary.status || "unknown") !== "passed") {
      abnormalLines.push("- gate status is not passed");
    }
    if (trackingStatus !== "passed") {
      abnormalLines.push(`- tracking_governance.status: \`${trackingStatus}\``);
    }
    if (trackingIssuesCount !== "unknown" && trackingIssuesCount !== 0) {
      abnormalLines.push(`- tracking_governance.issues_count: \`${trackingIssuesCount}\``);
    }
    if (trackingWarningsCount !== "unknown" && trackingWarningsCount !== 0) {
      abnormalLines.push(`- tracking_governance.warnings_count: \`${trackingWarningsCount}\``);
    }
    if (!trackingArtifactFound) {
      abnormalLines.push("- tracking_governance.artifact_found: `false`");
    }
    if (strictCodesStatus !== "passed") {
      abnormalLines.push(`- tracking_governance.strict_codes_check.status: \`${strictCodesStatus}\``);
    }
    if (!["validate", "supported_codes"].includes(strictCodesMode)) {
      abnormalLines.push(`- tracking_governance.strict_codes_check.mode: \`${strictCodesMode}\``);
    }
    if (strictCodesUnknownCount !== "unknown" && strictCodesUnknownCount !== 0) {
      abnormalLines.push(`- tracking_governance.strict_codes_check.unknown_count: \`${strictCodesUnknownCount}\``);
      abnormalLines.push(`- tracking_governance.strict_codes_check.unknown_codes: \`${strictCodesUnknownCodes}\``);
    }
    if (!strictCodesArtifactFound) {
      abnormalLines.push("- tracking_governance.strict_codes_check.artifact_found: `false`");
    }
    if (abnormalLines.length > 0) {
      lines.push("", "### Abnormal Fields", "", ...abnormalLines);
    } else {
      lines.push("", "### Abnormal Fields", "", "- none");
    }
  } else {
    lines.push(`- status: \`${summary.status || "unknown"}\``);
    lines.push(`- failed_step: \`${summary.failed_step || "none"}\``);
    lines.push(`- failed_steps: ${failedSteps.length > 0 ? failedSteps.map((step) => `\`${step}\``).join(", ") : "none"}`);
    lines.push(`- tracking_governance.status: \`${trackingStatus}\``);
    lines.push(`- tracking_governance.issues_count: \`${trackingIssuesCount}\``);
    lines.push(`- tracking_governance.warnings_count: \`${trackingWarningsCount}\``);
    lines.push(`- tracking_governance.strict_mode: \`${trackingStrictMode}\``);
    lines.push(`- tracking_governance.artifact_found: \`${trackingArtifactFound}\``);
    lines.push(`- tracking_governance.strict_codes_check.status: \`${strictCodesStatus}\``);
    lines.push(`- tracking_governance.strict_codes_check.mode: \`${strictCodesMode}\``);
    lines.push(`- tracking_governance.strict_codes_check.unknown_count: \`${strictCodesUnknownCount}\``);
    lines.push(`- tracking_governance.strict_codes_check.unknown_codes: \`${strictCodesUnknownCodes}\``);
    lines.push(`- tracking_governance.strict_codes_check.require_non_empty: \`${strictCodesRequireNonEmpty}\``);
    lines.push(`- tracking_governance.strict_codes_check.duration_ms: \`${strictCodesDurationMs}\``);
    lines.push(`- tracking_governance.strict_codes_check.artifact_found: \`${strictCodesArtifactFound}\``);
    lines.push("- artifact: `quality-gate-summary-json`");
  }

  lines.push("", "### Artifacts", "");
  lines.push("- Open this workflow run page and find the **Artifacts** section.");
  lines.push("- Download `quality-gate-summary-json` for gate aggregate summary.");
  lines.push("- Download `quality-gate-tracking-governance-summary` for tracking governance detail.");
  lines.push("- Download `quality-gate-tracking-governance-strict-codes-summary` for strict code precheck detail.");
  lines.push("");

  if ((summary.status || "unknown") !== "passed") {
    lines.push("### Failure Triage (First 5 Minutes)");
    lines.push("");
    lines.push(`- First failed step: \`${summary.failed_step || "unknown"}\``);
    lines.push("- Check job logs for the failed step first, then cross-check artifacts below.");
    lines.push("- Use `quality-gate-summary-json` to confirm all failed steps and execution order.");
    lines.push("- If tracking governance fields are abnormal, inspect `quality-gate-tracking-governance-summary`.");
    lines.push("- Local reproduce command: `npm run smoke:quality-gate:local`");
    lines.push("");
  }

  if (!trackingArtifactFound) {
    lines.push("### Tracking Artifact Missing Triage");
    lines.push("");
    lines.push("- `quality-gate-tracking-governance-summary` is missing in this run.");
    lines.push("- Verify `typecheck-and-test` job ran `npm run validate:tracking-governance` successfully.");
    lines.push("- Verify artifact upload step was executed and not filtered by conditions.");
    lines.push(
      "- Local verify command: `TRACKING_GOVERNANCE_SUMMARY_PATH=/tmp/ielts-tracking-governance-summary.json npm run validate:tracking-governance`"
    );
    lines.push("");
  }

  if (!strictCodesArtifactFound) {
    lines.push("### Strict Codes Artifact Missing Triage");
    lines.push("");
    lines.push("- `quality-gate-tracking-governance-strict-codes-summary` is missing in this run.");
    lines.push(
      "- Verify `typecheck-and-test` job ran `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001`."
    );
    lines.push("- Verify strict-codes summary upload step executed successfully.");
    lines.push("- Local verify command: `npm run validate:tracking-governance:strict-codes -- --strict_warning_codes TGW001`");
    lines.push("");
  }

  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  if (!abnormalOnly && steps.length > 0) {
    lines.push("| step | status | detail |");
    lines.push("|---|---|---|");
    for (const step of steps) {
      lines.push(`| ${step.name || "unknown"} | ${step.status || "unknown"} | ${step.detail || ""} |`);
    }
  } else if (abnormalOnly) {
    const abnormalStepsAll = steps
      .map((step, index) => ({ step, index }))
      .filter((entry) => entry.step && entry.step.status && entry.step.status !== "passed")
      .sort((left, right) => {
        const priorityDelta =
          getAbnormalPriorityRank(left.step.name, abnormalPriorityOrder, abnormalPriorityMatch.mode) -
          getAbnormalPriorityRank(right.step.name, abnormalPriorityOrder, abnormalPriorityMatch.mode);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.step);

    if (abnormalPriorityMatch.mode === "exact") {
      const abnormalNormalizedNames = abnormalStepsAll.map((step) => normalizeStepName(step.name));
      const exactHits = abnormalPriorityOrder.map((token) => {
        const hitCount = abnormalNormalizedNames.filter((name) => name === token).length;
        return `${token}=${hitCount}`;
      });
      lines.push(`- abnormal_priority_exact_hits: \`${exactHits.join(", ")}\``);

      const exactCandidates = Array.from(new Set(abnormalNormalizedNames.filter((name) => name.length > 0))).filter(
        (name) => !abnormalPriorityOrder.includes(name)
      );
      if (exactCandidates.length > 0) {
        lines.push(`- abnormal_priority_exact_hint: add exact token(s) like \`${exactCandidates.slice(0, 5).join(", ")}\``);
      } else {
        lines.push("- abnormal_priority_exact_hint: all abnormal steps already match configured exact tokens.");
      }
    }

    const abnormalSteps = abnormalStepsAll.slice(0, abnormalMaxSteps);
    if (abnormalSteps.length > 0) {
      lines.push("| abnormal_step | status | detail |");
      lines.push("|---|---|---|");
      for (const step of abnormalSteps) {
        lines.push(`| ${step.name || "unknown"} | ${step.status || "unknown"} | ${step.detail || ""} |`);
      }
    }
    if (abnormalStepsAll.length > abnormalSteps.length) {
      lines.push("");
      lines.push(`- abnormal_steps_truncated: showing first ${abnormalSteps.length}/${abnormalStepsAll.length}`);
      lines.push("- adjust `QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS` to change the limit.");
    }
  }

  return lines.join("\n");
};

module.exports = {
  MARKER,
  DEFAULT_ABNORMAL_PRIORITY,
  ABNORMAL_PRIORITY_TOKEN_REFERENCE,
  normalizeStepName,
  parsePriorityOrder,
  parsePriorityMatchMode,
  buildQualityGateSummaryComment
};
