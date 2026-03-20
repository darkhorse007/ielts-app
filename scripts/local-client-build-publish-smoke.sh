#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${CLIENT_BUILD_ARTIFACT_DIR:-/tmp/ielts-client-artifact-smoke}"
PUBLISH_DIR="${CLIENT_PUBLISH_OUTPUT_DIR:-/tmp/ielts-client-publish-smoke}"
PUBLISH_ROOT="${CLIENT_PUBLISH_ROOT:-/tmp/ielts-client-publish-root}"
RELEASE_ID="${CLIENT_PUBLISH_RELEASE_ID:-REL-CLIENT-SMOKE}"

rm -rf "$ARTIFACT_DIR" "$PUBLISH_DIR" "$PUBLISH_ROOT"

npm run client:artifact -- --release_id "$RELEASE_ID" --out_dir "$ARTIFACT_DIR"
npm run client:publish -- --artifact_dir "$ARTIFACT_DIR" --out_dir "$PUBLISH_DIR" --publish_root "$PUBLISH_ROOT"

test -f "$ARTIFACT_DIR/manifest.json"
test -f "$ARTIFACT_DIR/client-dist.tar.gz"
test -f "$PUBLISH_DIR/publish-manifest.json"
test -f "$PUBLISH_DIR/www/index.html"
test -f "$PUBLISH_ROOT/production/current.json"

echo "local client build/publish smoke passed"
