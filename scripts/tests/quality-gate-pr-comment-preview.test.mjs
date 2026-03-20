#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const SCRIPT_PATH = path.resolve("scripts/quality-gate-pr-comment-preview.mjs");

const runPreview = (args = [], env = {}) =>
  spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });

const createSummaryFixture = () => ({
  status: "failed",
  failed_step: "typecheck-and-test",
  failed_steps: ["typecheck-and-test"],
  tracking_governance: {
    status: "passed",
    issues_count: 0,
    warnings_count: 0,
    strict_mode: true,
    artifact_found: true,
    strict_codes_check: {
      status: "passed",
      mode: "validate",
      unknown_count: 0,
      unknown_codes: [],
      require_non_empty: false,
      duration_ms: 5,
      artifact_found: true
    }
  },
  steps: [
    {
      name: "typecheck-and-test",
      status: "failed",
      detail: "lint failure"
    },
    {
      name: "visual-snapshots",
      status: "failed",
      detail: "visual mismatch"
    }
  ]
});

const withTempDir = async (handler) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-pr-comment-preview-test-"));
  try {
    await handler(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test("preview cli renders comment from summary and supports abnormal exact mode", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "preview.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(
      envFilePath,
      [
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true",
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=exact",
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck-and-test,visual-snapshots"
      ].join("\n")
    );

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!-- quality-gate-summary-comment -->/);
    assert.match(result.stdout, /abnormal_priority_match: `exact`/);
    assert.match(result.stdout, /abnormal_priority_exact_hits:/);
    assert.match(result.stdout, /\| typecheck-and-test \| failed \| lint failure \|/);
    assert.match(result.stderr, /env-file/);
  });
});

test("preview cli parses escaped env values and trailing comments", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "escaped-preview.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(
      envFilePath,
      [
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true # abnormal mode",
        'QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH="exact" # trailing comment',
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck-and-test\\,visual-snapshots # escaped comma",
        "QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS=1 # force truncation"
      ].join("\n")
    );

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /abnormal_priority_match: `exact`/);
    assert.match(result.stdout, /\| typecheck-and-test \| failed \| lint failure \|/);
    assert.doesNotMatch(result.stdout, /\| visual-snapshots \| failed \| visual mismatch \|/);
    assert.match(result.stdout, /abnormal_steps_truncated: showing first 1\/2/);
  });
});

test("preview cli supports export-style env assignments", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "export-preview.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(
      envFilePath,
      [
        "export QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY=true",
        "export QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH=exact",
        "export QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY=typecheck-and-test,visual-snapshots"
      ].join("\n")
    );

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /abnormal_priority_match: `exact`/);
    assert.match(result.stdout, /abnormal_priority_exact_hits:/);
  });
});

test("preview cli supports export-style quoted assignments with whitespace variants", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "export-quoted-preview.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(
      envFilePath,
      [
        "   export   QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY = true   ",
        "export\tQUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH = \"exact\"   # quoted with comment",
        "export QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY = 'typecheck-and-test,visual-snapshots'   # single quote"
      ].join("\n")
    );

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /abnormal_priority_match: `exact`/);
    assert.match(result.stdout, /abnormal_priority_exact_hits:/);
  });
});

test("preview cli supports --out and keeps stdout content", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const outputPath = path.join(tempDir, "comment.md");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));

    const result = runPreview(["--summary", summaryPath, "--out", outputPath]);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(outputPath));
    const fileBody = fs.readFileSync(outputPath, "utf8");
    assert.match(fileBody, /## quality-gate summary/);
    assert.match(result.stdout, /## quality-gate summary/);
    assert.match(result.stderr, /output-file/);
  });
});

test("preview cli fails clearly when summary file is missing", () => {
  const missingPath = path.resolve("/tmp/non-existent-quality-gate-summary.json");
  const result = runPreview(["--summary", missingPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /summary file not found/);
});

test("preview cli fails clearly when env file is missing", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const missingEnvFilePath = path.join(tempDir, "not-found.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));

    const result = runPreview(["--summary", summaryPath, "--env_file", missingEnvFilePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /env file not found/);
  });
});

test("preview cli fails clearly when quoted env value has invalid trailing content", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "invalid-trailing.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(
      envFilePath,
      ['QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH="exact"invalid'].join("\n")
    );

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid trailing env content/);
  });
});

test("preview cli fails clearly when export assignment is invalid", async () => {
  await withTempDir((tempDir) => {
    const summaryPath = path.join(tempDir, "summary.json");
    const envFilePath = path.join(tempDir, "invalid-export.env");
    fs.writeFileSync(summaryPath, JSON.stringify(createSummaryFixture(), null, 2));
    fs.writeFileSync(envFilePath, ["export QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY"].join("\n"));

    const result = runPreview(["--summary", summaryPath, "--env_file", envFilePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid env assignment/);
  });
});
