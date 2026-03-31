#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
PLATFORM="${2:-}"

if [[ -z "$PROFILE" || -z "$PLATFORM" ]]; then
  echo "usage: bash scripts/mobile-eas-build.sh <development|preview|production> <ios|android|all> [extra eas args...]" >&2
  exit 1
fi

shift 2

case "$PROFILE" in
  development|preview|production)
    ;;
  *)
    echo "unsupported build profile: $PROFILE" >&2
    exit 1
    ;;
esac

case "$PLATFORM" in
  ios|android|all)
    ;;
  *)
    echo "unsupported platform: $PLATFORM" >&2
    exit 1
    ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="${MOBILE_APP_ROOT:-$ROOT_DIR/apps/mobile}"
ENV_FILE="${MOBILE_ENV_FILE:-$MOBILE_DIR/.env.local}"

if [[ ! -f "$MOBILE_DIR/eas.json" ]]; then
  echo "missing EAS config: $MOBILE_DIR/eas.json" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

validate_url() {
  local label="$1"
  local value="$2"
  local allowed="$3"

  node - "$label" "$value" "$allowed" <<'NODE'
const [label, value, allowed] = process.argv.slice(2);
const allowedProtocols = allowed.split(",");

try {
  const parsed = new URL(value);
  if (!allowedProtocols.includes(parsed.protocol)) {
    console.error(`${label} protocol must be one of ${allowedProtocols.join(", ")}`);
    process.exit(1);
  }
} catch {
  console.error(`${label} must be a valid absolute URL`);
  process.exit(1);
}
NODE
}

derive_ws_base_url() {
  node - "$1" <<'NODE'
const [apiBaseUrl] = process.argv.slice(2);
const parsed = new URL(apiBaseUrl);
if (parsed.protocol === "http:") {
  parsed.protocol = "ws:";
} else if (parsed.protocol === "https:") {
  parsed.protocol = "wss:";
}
process.stdout.write(parsed.toString().replace(/\/+$/, ""));
NODE
}

if [[ -n "${EXPO_PUBLIC_API_BASE_URL:-}" ]]; then
  validate_url "EXPO_PUBLIC_API_BASE_URL" "$EXPO_PUBLIC_API_BASE_URL" "http:,https:"

  if [[ -z "${EXPO_PUBLIC_WS_BASE_URL:-}" ]]; then
    EXPO_PUBLIC_WS_BASE_URL="$(derive_ws_base_url "$EXPO_PUBLIC_API_BASE_URL")"
    export EXPO_PUBLIC_WS_BASE_URL
  else
    validate_url "EXPO_PUBLIC_WS_BASE_URL" "$EXPO_PUBLIC_WS_BASE_URL" "ws:,wss:,http:,https:"
  fi

  echo "Using embedded self-hosted instance:"
  echo "  API: $EXPO_PUBLIC_API_BASE_URL"
  echo "  WS:  $EXPO_PUBLIC_WS_BASE_URL"
else
  echo "No EXPO_PUBLIC_API_BASE_URL configured; build will open on the instance binding screen."
fi

if command -v eas >/dev/null 2>&1; then
  EAS_CMD=(eas)
else
  EAS_CMD=(npx --yes eas-cli)
fi

if ! node -e 'const app = require(process.argv[1]); const projectId = app?.expo?.extra?.eas?.projectId; if (!projectId) process.exit(1);' "$MOBILE_DIR/app.json"; then
  echo "EAS projectId is not linked yet; first build may prompt for 'npx eas-cli@latest init'." >&2
fi

run_build() {
  local target="$1"
  shift
  (
    cd "$MOBILE_DIR"
    "${EAS_CMD[@]}" build --profile "$PROFILE" --platform "$target" "$@"
  )
}

if [[ "$PLATFORM" == "all" ]]; then
  run_build ios "$@"
  run_build android "$@"
else
  run_build "$PLATFORM" "$@"
fi
