#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_SCRIPT="$ROOT_DIR/scripts/tests/run-node-test-summary.sh"

fail() {
  echo "[node-test-summary-test] FAIL: $1" >&2
  exit 1
}

test_multi_file_pass_summary() {
  local temp_dir pass_a pass_b output
  temp_dir="$(mktemp -d)"
  pass_a="$temp_dir/pass-a.test.mjs"
  pass_b="$temp_dir/pass-b.test.mjs"

  cat > "$pass_a" <<'EOF'
import test from "node:test";
test("pass-a", () => {});
EOF
  cat > "$pass_b" <<'EOF'
import test from "node:test";
test("pass-b", () => {});
EOF

  output="$(bash "$RUN_SCRIPT" "$pass_a" "$pass_b")"
  [[ "$output" == *"PASS files=2"* ]] || fail "expected aggregated pass summary for two files"
  [[ "$output" == *"tests=2"* ]] || fail "expected aggregated tests count"
  rm -rf "$temp_dir"
}

test_multi_file_failure_replays_log() {
  local temp_dir pass_file fail_file output rc
  temp_dir="$(mktemp -d)"
  pass_file="$temp_dir/pass.test.mjs"
  fail_file="$temp_dir/fail.test.mjs"

  cat > "$pass_file" <<'EOF'
import test from "node:test";
test("pass", () => {});
EOF
  cat > "$fail_file" <<'EOF'
import test from "node:test";
test("fail", () => {
  throw new Error("intentional failure");
});
EOF

  set +e
  output="$(bash "$RUN_SCRIPT" "$pass_file" "$fail_file" 2>&1)"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || fail "expected non-zero exit when one file fails"
  [[ "$output" == *"[node-test-summary] FAIL $fail_file"* ]] || fail "expected failed file marker"
  [[ "$output" == *"intentional failure"* ]] || fail "expected replayed test failure log"
  rm -rf "$temp_dir"
}

test_verbose_mode_passthrough() {
  local temp_dir pass_file output
  temp_dir="$(mktemp -d)"
  pass_file="$temp_dir/pass.test.mjs"

  cat > "$pass_file" <<'EOF'
import test from "node:test";
test("pass", () => {});
EOF

  output="$(RELEASE_SCRIPT_TESTS_NODE_VERBOSE=true bash "$RUN_SCRIPT" "$pass_file")"
  [[ "$output" == *"TAP version 13"* ]] || fail "expected verbose TAP output"
  rm -rf "$temp_dir"
}

test_multi_file_pass_summary
test_multi_file_failure_replays_log
test_verbose_mode_passthrough

echo "[node-test-summary-test] PASS"
