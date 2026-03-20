#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const STRICT_CODES_SCRIPT_PATH = path.resolve("scripts/tracking-governance-strict-codes-check.mjs");
const STRICT_CODES_SCHEMA_PATH = path.resolve(
  "docs/tracking/schemas/tracking-governance-strict-codes-summary.schema.json"
);

const schema = JSON.parse(fs.readFileSync(STRICT_CODES_SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateBySchema = ajv.compile(schema);

const runStrictCodes = (args = [], env = {}) =>
  spawnSync(process.execPath, [STRICT_CODES_SCRIPT_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });

const assertSchemaValid = (value, label) => {
  const valid = validateBySchema(value);
  const details = ajv.errorsText(validateBySchema.errors, {
    separator: "; ",
    dataVar: label
  });
  assert.equal(valid, true, `${label} schema validation failed: ${details}`);
};

const assertSchemaValidationFails = (value, expectedMessagePattern) => {
  const valid = validateBySchema(value);
  assert.equal(valid, false, "expected schema validation to fail");
  const details = ajv.errorsText(validateBySchema.errors, {
    separator: "; ",
    dataVar: "payload"
  });
  assert.match(details, expectedMessagePattern);
};

const createValidFixturePayload = () => ({
  schema_version: "1.0",
  schema_url: schema.$id,
  status: "passed",
  mode: "validate",
  output_mode: "json",
  checked_at: new Date().toISOString(),
  strict_warning_codes: ["TGW001"],
  strict_warning_codes_unknown: [],
  supported_warning_codes: ["TGW001", "TGW002", "TGW003"],
  allow_unknown: false,
  require_non_empty: false,
  empty_input: false,
  duration_ms: 0
});

const withTempDir = async (handler) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-codes-schema-contract-test-"));
  try {
    await handler(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test("validate/json output matches strict-codes summary schema contract", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "validate-summary.json");
    const result = runStrictCodes(
      ["--strict_warning_codes", "TGW001", "--output_mode", "json"],
      {
        TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const stdoutPayload = JSON.parse(result.stdout.trim());
    const summaryPayload = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

    assert.equal(summaryPayload.schema_url, schema.$id);
    assert.equal(stdoutPayload.schema_url, schema.$id);

    assertSchemaValid(stdoutPayload, "payload");
    assertSchemaValid(summaryPayload, "summary");
  });
});

test("supported_codes/json output also matches strict-codes summary schema contract", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "supported-summary.json");
    const result = runStrictCodes(
      ["--supported_codes", "json"],
      {
        TRACKING_GOVERNANCE_STRICT_CODES_SUMMARY_PATH: summaryPath
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const stdoutPayload = JSON.parse(result.stdout.trim());
    const summaryPayload = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

    assert.equal(summaryPayload.schema_url, schema.$id);
    assert.equal(stdoutPayload.schema_url, schema.$id);

    assertSchemaValid(stdoutPayload, "payload");
    assertSchemaValid(summaryPayload, "summary");
  });
});

test("schema contract rejects payload with missing required field", () => {
  const invalidPayload = createValidFixturePayload();
  delete invalidPayload.schema_url;
  assertSchemaValidationFails(invalidPayload, /must have required property 'schema_url'/);
});

test("schema contract rejects payload with incorrect field type", () => {
  const invalidPayload = createValidFixturePayload();
  invalidPayload.duration_ms = "0";
  assertSchemaValidationFails(invalidPayload, /duration_ms must be integer/);
});

test("schema contract rejects payload with unknown field", () => {
  const invalidPayload = createValidFixturePayload();
  invalidPayload.extra_field = "unexpected";
  assertSchemaValidationFails(invalidPayload, /must NOT have additional properties/);
});

test("schema contract rejects payload with invalid checked_at format", () => {
  const invalidPayload = createValidFixturePayload();
  invalidPayload.checked_at = "2026-03-05";
  assertSchemaValidationFails(invalidPayload, /checked_at must match format "date-time"/);
});

test("schema contract rejects payload with invalid schema_url path format", () => {
  const invalidPayload = createValidFixturePayload();
  invalidPayload.schema_url = "https://example.com/schema.json";
  assertSchemaValidationFails(invalidPayload, /schema_url must match pattern/);
});

test("schema contract rejects unsupported output_mode/mode combination", () => {
  const invalidPayload = createValidFixturePayload();
  invalidPayload.mode = "supported_codes";
  invalidPayload.output_mode = "silent";
  assertSchemaValidationFails(invalidPayload, /output_mode must be equal to one of the allowed values/);
});
