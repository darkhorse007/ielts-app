#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "[node-test-summary] FAIL: missing target file arguments" >&2
  exit 1
fi
TARGET_FILES=("$@")

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

VERBOSE_MODE="${RELEASE_SCRIPT_TESTS_NODE_VERBOSE:-false}"
if is_truthy "$VERBOSE_MODE"; then
  for target_file in "${TARGET_FILES[@]}"; do
    node "$target_file"
  done
  exit 0
fi

WORK_DIR="$(mktemp -d)"
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_FILES=0
FAILED_FILES=()

for target_file in "${TARGET_FILES[@]}"; do
  TOTAL_FILES=$((TOTAL_FILES + 1))
  log_file="$WORK_DIR/$TOTAL_FILES.log"
  set +e
  node "$target_file" >"$log_file" 2>&1
  rc=$?
  set -e

  tests_count="$(awk '/^# tests /{print $3}' "$log_file" | tail -n 1)"
  fail_count="$(awk '/^# fail /{print $3}' "$log_file" | tail -n 1)"
  pass_count="$(awk '/^# pass /{print $3}' "$log_file" | tail -n 1)"
  tests_count="${tests_count:-0}"
  pass_count="${pass_count:-0}"
  fail_count="${fail_count:-0}"

  if [[ "$tests_count" =~ ^[0-9]+$ ]]; then
    TOTAL_TESTS=$((TOTAL_TESTS + tests_count))
  fi
  if [[ "$pass_count" =~ ^[0-9]+$ ]]; then
    TOTAL_PASSED=$((TOTAL_PASSED + pass_count))
  fi
  if [[ "$fail_count" =~ ^[0-9]+$ ]]; then
    TOTAL_FAILED=$((TOTAL_FAILED + fail_count))
  fi

  if [[ "$rc" -ne 0 ]]; then
    FAILED_FILES+=("${target_file}|${log_file}")
    continue
  fi
done

if [[ "${#FAILED_FILES[@]}" -eq 0 ]]; then
  echo "[node-test-summary] PASS files=${TOTAL_FILES} tests=${TOTAL_TESTS} pass=${TOTAL_PASSED} fail=${TOTAL_FAILED}"
  rm -rf "$WORK_DIR"
  exit 0
fi

for failed_entry in "${FAILED_FILES[@]}"; do
  failed_file="${failed_entry%%|*}"
  failed_log="${failed_entry#*|}"
  echo "[node-test-summary] FAIL ${failed_file}" >&2
  cat "$failed_log" >&2
done
rm -rf "$WORK_DIR"
exit 1
