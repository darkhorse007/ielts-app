#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_WARNING_CODES = ["TGW001", "TGW002", "TGW003"];
const SUMMARY_SCHEMA_VERSION = "1.0";
const SUMMARY_SCHEMA_URL = "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json";
const defaults = {
  strict_warning_codes: "",
  summary: "",
  allow_unknown: "false",
  require_non_empty: "false",
  supported_codes: "",
  output_mode: "auto",
  summary_to_stderr: "true",
  quiet: "false"
};

const parseArgs = () => {
  const args = {};
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

const resolveArg = (args, key, envValue, defaultValue) => {
  if (Object.prototype.hasOwnProperty.call(args, key)) {
    return args[key];
  }
  if (envValue != null && String(envValue).trim() !== "") {
    return envValue;
  }
  return defaultValue;
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

const parseSupportedCodesMode = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "json") {
    return "json";
  }
  if (["1", "true", "yes", "y", "on", "text"].includes(normalized)) {
    return "text";
  }
  return "invalid";
};

const parseOutputMode = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "auto") {
    return "auto";
  }
  if (["text", "json", "silent"].includes(normalized)) {
    return normalized;
  }
  return "invalid";
};

const writeSummary = (summaryPath, summary, options) => {
  if (!summaryPath) {
    return;
  }
  const resolved = path.resolve(summaryPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  if (options.quiet) {
    return;
  }
  const message = `[tracking-governance-strict-codes] summary-file ${resolved}`;
  if (options.summaryToStderr || options.forceSummaryStderr) {
    console.error(message);
  } else {
    console.log(message);
  }
};

const resolveEffectiveOutputMode = (outputMode, supportedCodesMode) => {
  if (outputMode !== "auto") {
    return outputMode;
  }
  if (supportedCodesMode === "json") {
    return "json";
  }
  return "text";
};

const main = () => {
  const startedAt = Date.now();
  const args = parseArgs();
  const summaryPath = resolveArg(
    args,
    "summary",
    process.env.TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH,
    defaults.summary
  );
  const allowUnknown = isTruthy(
    resolveArg(
      args,
      "allow_unknown",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_ALLOW_UNKNOWN,
      defaults.allow_unknown
    )
  );
  const requireNonEmpty = isTruthy(
    resolveArg(
      args,
      "require_non_empty",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY,
      defaults.require_non_empty
    )
  );
  const supportedCodesMode = parseSupportedCodesMode(
    resolveArg(
      args,
      "supported_codes",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_SUPPORTED_CODES,
      defaults.supported_codes
    )
  );
  const outputMode = parseOutputMode(
    resolveArg(
      args,
      "output_mode",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_OUTPUT_MODE,
      defaults.output_mode
    )
  );
  const strictWarningCodes = parseStrictWarningCodes(
    resolveArg(
      args,
      "strict_warning_codes",
      process.env.TRACKING_GOVERNANCE_STRICT_WARNING_CODES,
      defaults.strict_warning_codes
    )
  );
  const summaryToStderr = isTruthy(
    resolveArg(
      args,
      "summary_to_stderr",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_TO_STDERR,
      defaults.summary_to_stderr
    )
  );
  const quiet = isTruthy(
    resolveArg(
      args,
      "quiet",
      process.env.TRACKING_GOVERNANCE_STRICT_CODES_QUIET,
      defaults.quiet
    )
  );

  if (outputMode === "invalid") {
    const durationMs = Date.now() - startedAt;
    const invalidOutputModeSummary = {
      schema_version: SUMMARY_SCHEMA_VERSION,
      schema_url: SUMMARY_SCHEMA_URL,
      status: "failed",
      mode: "validate",
      output_mode: outputMode,
      checked_at: new Date().toISOString(),
      strict_warning_codes: strictWarningCodes,
      strict_warning_codes_unknown: [],
      supported_warning_codes: SUPPORTED_WARNING_CODES,
      allow_unknown: allowUnknown,
      require_non_empty: requireNonEmpty,
      empty_input: strictWarningCodes.length === 0,
      duration_ms: durationMs
    };
    const outputOptions = { summaryToStderr, quiet, forceSummaryStderr: false };
    writeSummary(summaryPath, invalidOutputModeSummary, outputOptions);
    if (!quiet) {
      console.error("[tracking-governance-strict-codes] failed");
      console.error("- --output_mode must be one of: auto|text|json|silent");
    }
    process.exit(1);
  }

  const effectiveOutputMode = resolveEffectiveOutputMode(outputMode, supportedCodesMode);
  const baseOutputOptions = {
    summaryToStderr,
    quiet,
    forceSummaryStderr: false
  };

  if (supportedCodesMode && effectiveOutputMode === "silent") {
    const durationMs = Date.now() - startedAt;
    const invalidCombinationSummary = {
      schema_version: SUMMARY_SCHEMA_VERSION,
      schema_url: SUMMARY_SCHEMA_URL,
      status: "failed",
      mode: "supported_codes",
      output_mode: effectiveOutputMode,
      checked_at: new Date().toISOString(),
      strict_warning_codes: strictWarningCodes,
      strict_warning_codes_unknown: [],
      supported_warning_codes: SUPPORTED_WARNING_CODES,
      allow_unknown: allowUnknown,
      require_non_empty: requireNonEmpty,
      empty_input: strictWarningCodes.length === 0,
      duration_ms: durationMs
    };
    writeSummary(summaryPath, invalidCombinationSummary, baseOutputOptions);
    if (!quiet) {
      console.error("[tracking-governance-strict-codes] failed");
      console.error("- --supported_codes cannot be combined with --output_mode=silent");
      console.error("- use --output_mode text|json when --supported_codes is enabled");
    }
    process.exit(1);
  }

  const outputOptions = {
    summaryToStderr,
    quiet: quiet || effectiveOutputMode === "silent",
    forceSummaryStderr: effectiveOutputMode === "json"
  };

  if (supportedCodesMode === "invalid") {
    const durationMs = Date.now() - startedAt;
    const invalidSummary = {
      schema_version: SUMMARY_SCHEMA_VERSION,
      schema_url: SUMMARY_SCHEMA_URL,
      status: "failed",
      mode: "supported_codes",
      output_mode: effectiveOutputMode,
      checked_at: new Date().toISOString(),
      strict_warning_codes: strictWarningCodes,
      strict_warning_codes_unknown: [],
      supported_warning_codes: SUPPORTED_WARNING_CODES,
      allow_unknown: allowUnknown,
      require_non_empty: requireNonEmpty,
      empty_input: strictWarningCodes.length === 0,
      duration_ms: durationMs
    };
    writeSummary(summaryPath, invalidSummary, outputOptions);
    if (effectiveOutputMode === "json") {
      process.stdout.write(`${JSON.stringify(invalidSummary)}\n`);
    } else if (!outputOptions.quiet) {
      console.error("[tracking-governance-strict-codes] failed");
      console.error("- --supported_codes must be one of: true|text|json");
    }
    process.exit(1);
  }

  if (supportedCodesMode) {
    const durationMs = Date.now() - startedAt;
    const supportedCodesSummary = {
      schema_version: SUMMARY_SCHEMA_VERSION,
      schema_url: SUMMARY_SCHEMA_URL,
      status: "passed",
      mode: "supported_codes",
      output_mode: effectiveOutputMode,
      checked_at: new Date().toISOString(),
      strict_warning_codes: strictWarningCodes,
      strict_warning_codes_unknown: [],
      supported_warning_codes: SUPPORTED_WARNING_CODES,
      allow_unknown: allowUnknown,
      require_non_empty: requireNonEmpty,
      empty_input: strictWarningCodes.length === 0,
      duration_ms: durationMs
    };
    writeSummary(summaryPath, supportedCodesSummary, outputOptions);
    if (effectiveOutputMode === "json") {
      process.stdout.write(`${JSON.stringify(supportedCodesSummary)}\n`);
    } else if (effectiveOutputMode === "text" && !outputOptions.quiet) {
      console.log(`[tracking-governance-strict-codes] supported warning code(s): ${SUPPORTED_WARNING_CODES.join(", ")}`);
    }
    return;
  }

  const emptyInput = strictWarningCodes.length === 0;
  const missingRequiredInput = requireNonEmpty && emptyInput;
  const strictWarningCodesUnknown = strictWarningCodes.filter(
    (code) => code !== "*" && !SUPPORTED_WARNING_CODES.includes(code)
  );
  const durationMs = Date.now() - startedAt;

  const summary = {
    schema_version: SUMMARY_SCHEMA_VERSION,
    schema_url: SUMMARY_SCHEMA_URL,
    status:
      missingRequiredInput || (strictWarningCodesUnknown.length > 0 && !allowUnknown)
        ? "failed"
        : "passed",
    mode: "validate",
    output_mode: effectiveOutputMode,
    checked_at: new Date().toISOString(),
    strict_warning_codes: strictWarningCodes,
    strict_warning_codes_unknown: strictWarningCodesUnknown,
    supported_warning_codes: SUPPORTED_WARNING_CODES,
    allow_unknown: allowUnknown,
    require_non_empty: requireNonEmpty,
    empty_input: emptyInput,
    duration_ms: durationMs
  };
  writeSummary(summaryPath, summary, outputOptions);

  if (summary.status === "failed") {
    if (effectiveOutputMode === "json") {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    } else if (!outputOptions.quiet) {
      console.error("[tracking-governance-strict-codes] failed");
      if (missingRequiredInput) {
        console.error("- strict warning code input is required but empty");
        console.error("- provide --strict_warning_codes (e.g. TGW001) or disable --require_non_empty");
      }
      if (strictWarningCodesUnknown.length > 0 && !allowUnknown) {
        console.error(`- unknown strict warning code(s): ${strictWarningCodesUnknown.join(", ")}`);
        console.error(`- supported warning code(s): ${SUPPORTED_WARNING_CODES.join(", ")}, *`);
      }
    }
    process.exit(1);
  }

  if (effectiveOutputMode === "json") {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else if (effectiveOutputMode === "text" && !outputOptions.quiet) {
    if (strictWarningCodesUnknown.length > 0 && allowUnknown) {
      console.log("[tracking-governance-strict-codes] passed with warnings");
      console.log(`- unknown strict warning code(s): ${strictWarningCodesUnknown.join(", ")}`);
    } else {
      console.log("[tracking-governance-strict-codes] passed");
    }
    console.log(`[tracking-governance-strict-codes] strict_warning_codes: ${strictWarningCodes.join(",") || "none"}`);
  }
};

try {
  main();
} catch (error) {
  console.error(`[tracking-governance-strict-codes] ERROR: ${error.message}`);
  process.exit(1);
}
