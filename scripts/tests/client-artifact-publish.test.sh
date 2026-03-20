#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_SCRIPT="$ROOT_DIR/scripts/client-artifact-build.mjs"
PUBLISH_SCRIPT="$ROOT_DIR/scripts/client-publish.mjs"

fail() {
  echo "[client-artifact-publish-test] FAIL: $1" >&2
  exit 1
}

write_fake_dist() {
  local dist_dir="$1"
  mkdir -p "$dist_dir/assets"
  cat > "$dist_dir/index.html" <<'EOF'
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>IELTS Client</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>
EOF
  cat > "$dist_dir/assets/main.js" <<'EOF'
console.log("client bundle fixture");
EOF
}

test_artifact_and_publish_flow() {
  local temp_dir dist_dir artifact_dir publish_root publish_dir output
  temp_dir="$(mktemp -d)"
  dist_dir="$temp_dir/dist"
  artifact_dir="$temp_dir/artifact"
  publish_root="$temp_dir/publish-root"
  publish_dir="$temp_dir/publish-out"

  write_fake_dist "$dist_dir"

  output="$(
    node "$ARTIFACT_SCRIPT" \
      --release_id REL-CLIENT-TEST \
      --dist_dir "$dist_dir" \
      --out_dir "$artifact_dir" \
      --skip_build true
  )"

  [[ "$output" == *"client artifact written to"* ]] || fail "artifact script should report output path"
  [[ -f "$artifact_dir/manifest.json" ]] || fail "artifact manifest missing"
  [[ -f "$artifact_dir/client-dist.tar.gz" ]] || fail "artifact tarball missing"
  [[ -f "$artifact_dir/bundle/index.html" ]] || fail "artifact bundle missing index"
  grep -q '"release_id": "REL-CLIENT-TEST"' "$artifact_dir/manifest.json" || fail "artifact manifest release_id mismatch"

  output="$(
    node "$PUBLISH_SCRIPT" \
      --artifact_dir "$artifact_dir" \
      --publish_root "$publish_root" \
      --out_dir "$publish_dir"
  )"

  [[ "$output" == *"client publish written to"* ]] || fail "publish script should report output path"
  [[ -f "$publish_dir/publish-manifest.json" ]] || fail "publish manifest missing"
  [[ -f "$publish_dir/www/index.html" ]] || fail "published index missing"
  [[ -f "$publish_root/production/current.json" ]] || fail "current pointer missing"
  grep -q '"release_id": "REL-CLIENT-TEST"' "$publish_dir/publish-manifest.json" || fail "publish manifest release_id mismatch"
  rm -rf "$temp_dir"
}

test_dry_run() {
  local temp_dir dist_dir artifact_dir publish_root publish_dir artifact_output publish_output
  temp_dir="$(mktemp -d)"
  dist_dir="$temp_dir/dist"
  artifact_dir="$temp_dir/artifact"
  publish_root="$temp_dir/publish-root"
  publish_dir="$temp_dir/publish-out"

  write_fake_dist "$dist_dir"

  artifact_output="$(
    node "$ARTIFACT_SCRIPT" \
      --release_id REL-CLIENT-DRYRUN \
      --dist_dir "$dist_dir" \
      --out_dir "$artifact_dir" \
      --skip_build true \
      --dry_run true
  )"
  [[ "$artifact_output" == *"[dry-run] artifact directory"* ]] || fail "artifact dry-run output missing"
  [[ ! -e "$artifact_dir" ]] || fail "artifact dry-run should not create output"

  mkdir -p "$artifact_dir"
  cat > "$artifact_dir/manifest.json" <<'EOF'
{
  "release_id": "REL-CLIENT-DRYRUN",
  "build_id": "REL-CLIENT-DRYRUN-1"
}
EOF
  mkdir -p "$artifact_dir/bundle"
  echo "fixture" > "$artifact_dir/bundle/index.html"

  publish_output="$(
    node "$PUBLISH_SCRIPT" \
      --artifact_dir "$artifact_dir" \
      --publish_root "$publish_root" \
      --out_dir "$publish_dir" \
      --dry_run true
  )"
  [[ "$publish_output" == *"[dry-run] would publish client artifact"* ]] || fail "publish dry-run output missing"
  [[ ! -e "$publish_dir" ]] || fail "publish dry-run should not create output"
  rm -rf "$temp_dir"
}

test_artifact_and_publish_flow
test_dry_run

echo "[client-artifact-publish-test] PASS"
