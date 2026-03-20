#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { MARKER, buildQualityGateSummaryComment } = require("../ci/quality-gate-pr-comment.js");

const baseSummary = () => ({
  status: "failed",
  failed_step: "unit-integration-tests",
  failed_steps: ["unit-integration-tests", "visual-snapshots"],
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
      duration_ms: 3,
      artifact_found: true
    }
  },
  steps: [
    { name: "visual-snapshots", status: "failed", detail: "visual mismatch" },
    { name: "typecheck-and-test", status: "failed", detail: "typecheck failed" },
    { name: "postgres-smoke", status: "failed", detail: "postgres service down" }
  ]
});

const indexOfLine = (body, needle) => {
  const line = body
    .split("\n")
    .find((item) => item.includes(needle));
  return line ? body.indexOf(line) : -1;
};

test("non-abnormal mode prints full step table", () => {
  const body = buildQualityGateSummaryComment({
    summary: baseSummary(),
    env: {}
  });
  assert.match(body, new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /\| step \| status \| detail \|/);
  assert.match(body, /\| visual-snapshots \| failed \| visual mismatch \|/);
});

test("abnormal mode sorts by contains priority order", () => {
  const body = buildQualityGateSummaryComment({
    summary: baseSummary(),
    env: {
      QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY: "true",
      QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY: "typecheck,postgres,visual",
      QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH: "contains"
    }
  });

  const typecheckIndex = indexOfLine(body, "| typecheck-and-test | failed |");
  const postgresIndex = indexOfLine(body, "| postgres-smoke | failed |");
  const visualIndex = indexOfLine(body, "| visual-snapshots | failed |");
  assert.ok(typecheckIndex >= 0);
  assert.ok(postgresIndex >= 0);
  assert.ok(visualIndex >= 0);
  assert.ok(typecheckIndex < postgresIndex);
  assert.ok(postgresIndex < visualIndex);
  assert.match(body, /abnormal_priority_reference:/);
});

test("exact mode emits token hit hints and exact-token guidance", () => {
  const body = buildQualityGateSummaryComment({
    summary: baseSummary(),
    env: {
      QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY: "true",
      QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY: "typecheck,test",
      QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH: "exact"
    }
  });

  assert.match(body, /abnormal_priority_match: `exact`/);
  assert.match(body, /abnormal_priority_exact_hits: `typecheck=0, test=0`/);
  assert.match(body, /abnormal_priority_exact_hint: add exact token\(s\) like `visual-snapshots, typecheck-and-test, postgres-smoke`/);
});

test("invalid match mode falls back to contains with explicit fallback message", () => {
  const body = buildQualityGateSummaryComment({
    summary: baseSummary(),
    env: {
      QUALITY_GATE_PR_COMMENT_ABNORMAL_ONLY: "true",
      QUALITY_GATE_PR_COMMENT_ABNORMAL_PRIORITY_MATCH: "regex"
    }
  });

  assert.match(body, /abnormal_priority_match: `contains`/);
  assert.match(body, /abnormal_priority_match_fallback: invalid input `regex`, fallback `contains`/);
});
