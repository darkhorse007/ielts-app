#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildQualityGateSummaryComment } = require("./ci/quality-gate-pr-comment.js");

const defaults = {
  summary: "/tmp/ielts-quality-gate-summary.json",
  env_file: "",
  out: ""
};
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

const unescapeEnvChar = (character) => {
  switch (character) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return character;
  }
};

const parseQuotedEnvValue = (rawValue, quoteChar, resolvedPath, lineNumber) => {
  let value = "";
  let index = 1;
  while (index < rawValue.length) {
    const current = rawValue[index];
    if (current === "\\") {
      const next = rawValue[index + 1];
      if (next == null) {
        value += "\\";
        index += 1;
        continue;
      }
      value += unescapeEnvChar(next);
      index += 2;
      continue;
    }
    if (current === quoteChar) {
      const trailing = rawValue.slice(index + 1).trim();
      if (trailing.length > 0 && !trailing.startsWith("#")) {
        throw new Error(`invalid trailing env content at ${resolvedPath}:${lineNumber}`);
      }
      return value;
    }
    value += current;
    index += 1;
  }
  throw new Error(`unterminated quoted env value at ${resolvedPath}:${lineNumber}`);
};

const parseUnquotedEnvValue = (rawValue) => {
  let value = "";
  let escaped = false;
  for (let index = 0; index < rawValue.length; index += 1) {
    const current = rawValue[index];
    if (escaped) {
      value += unescapeEnvChar(current);
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "#") {
      break;
    }
    value += current;
  }
  if (escaped) {
    value += "\\";
  }
  return value.trim();
};

const parseEnvValue = (rawValue, resolvedPath, lineNumber) => {
  const trimmedStart = String(rawValue ?? "").trimStart();
  if (trimmedStart.length === 0) {
    return "";
  }
  const first = trimmedStart[0];
  if (first === '"' || first === "'") {
    return parseQuotedEnvValue(trimmedStart, first, resolvedPath, lineNumber);
  }
  return parseUnquotedEnvValue(trimmedStart);
};

const parseEnvFile = (envFilePath) => {
  if (!envFilePath || String(envFilePath).trim().length === 0) {
    return {
      resolvedPath: "",
      values: {}
    };
  }

  const resolvedPath = path.resolve(String(envFilePath).trim());
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`env file not found: ${resolvedPath}`);
  }

  const values = {};
  const lines = fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const assignment = /^\s*export\s+/.test(trimmed) ? trimmed.replace(/^\s*export\s+/, "") : trimmed;
    const separatorIndex = assignment.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`invalid env assignment at ${resolvedPath}:${index + 1}`);
    }

    const key = assignment.slice(0, separatorIndex).trim();
    if (!key || !ENV_KEY_PATTERN.test(key)) {
      throw new Error(`invalid env key at ${resolvedPath}:${index + 1}`);
    }

    const value = parseEnvValue(assignment.slice(separatorIndex + 1), resolvedPath, index + 1);
    values[key] = value;
  }

  return {
    resolvedPath,
    values
  };
};

const main = () => {
  const args = parseArgs();
  const summaryPath = path.resolve(args.summary || defaults.summary);
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`summary file not found: ${summaryPath}`);
  }

  const parsedEnvFile = parseEnvFile(args.env_file);
  const mergedEnv = {
    ...parsedEnvFile.values,
    ...process.env
  };
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const commentBody = buildQualityGateSummaryComment({
    summary,
    env: mergedEnv
  });

  process.stdout.write(`${commentBody}\n`);

  if (parsedEnvFile.resolvedPath) {
    console.error(`[quality-gate-pr-comment-preview] env-file ${parsedEnvFile.resolvedPath}`);
  }

  if (args.out && String(args.out).trim().length > 0) {
    const outputPath = path.resolve(String(args.out).trim());
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${commentBody}\n`, "utf8");
    console.error(`[quality-gate-pr-comment-preview] output-file ${outputPath}`);
  }
};

try {
  main();
} catch (error) {
  console.error(`[quality-gate-pr-comment-preview] ERROR: ${error.message}`);
  process.exit(1);
}
