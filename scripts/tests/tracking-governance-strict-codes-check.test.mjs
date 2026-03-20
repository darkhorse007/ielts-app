#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const SCRIPT_PATH = path.resolve("scripts/tracking-governance-strict-codes-check.mjs");

const runStrictCodes = (args = [], env = {}) =>
  spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });

const withTempDir = async (handler) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-codes-node-test-"));
  try {
    await handler(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test("supported_codes json mode keeps stdout machine-readable", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "supported-codes-summary.json");
    const result = runStrictCodes(
      ["--supported_codes", "json"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.schema_version, "1.0");
    assert.equal(payload.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(payload.status, "passed");
    assert.equal(payload.mode, "supported_codes");
    assert.ok(Array.isArray(payload.supported_warning_codes));

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.mode, "supported_codes");
    assert.equal(summary.output_mode, "json");
  });
});

test("validate mode supports output_mode=json", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "validate-json-summary.json");
    const result = runStrictCodes(
      ["--strict_warning_codes", "TGW001", "--output_mode", "json"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.schema_version, "1.0");
    assert.equal(payload.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(payload.status, "passed");
    assert.equal(payload.mode, "validate");
    assert.equal(payload.output_mode, "json");

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.output_mode, "json");
  });
});

test("output_mode=silent suppresses runtime logs", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "silent-summary.json");
    const result = runStrictCodes(
      ["--strict_warning_codes", "TGW001", "--output_mode", "silent"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "");
    assert.equal(result.stderr.trim(), "");

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.status, "passed");
    assert.equal(summary.output_mode, "silent");
  });
});

test("summary_to_stderr=false routes summary-file log to stdout", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary-stdout-summary.json");
    const result = runStrictCodes(
      ["--strict_warning_codes", "TGW001", "--summary_to_stderr", "false"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /summary-file/);
    assert.equal(result.stderr.trim(), "");
  });
});

test("require_non_empty can be enabled via env var", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "require-non-empty-env-summary.json");
    const result = runStrictCodes([], {
      TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath,
      TRACKING_GOVERNANCE_STRICT_CODES_REQUIRE_NON_EMPTY: "true"
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /strict warning code input is required/);
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.status, "failed");
    assert.equal(summary.require_non_empty, true);
  });
});

test("invalid output_mode fails fast with clear message", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "invalid-output-mode-summary.json");
    const result = runStrictCodes(
      ["--strict_warning_codes", "TGW001", "--output_mode", "yaml"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--output_mode must be one of: auto\|text\|json\|silent/);
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.status, "failed");
  });
});

test("supported_codes cannot be combined with output_mode=silent", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "invalid-supported-codes-output-mode-summary.json");
    const result = runStrictCodes(
      ["--supported_codes", "json", "--output_mode", "silent"],
      { TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--supported_codes cannot be combined with --output_mode=silent/);
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.schema_version, "1.0");
    assert.equal(summary.schema_url, "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json");
    assert.equal(summary.status, "failed");
    assert.equal(summary.mode, "supported_codes");
    assert.equal(summary.output_mode, "silent");
  });
});
