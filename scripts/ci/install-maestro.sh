#!/usr/bin/env bash
set -euo pipefail

INSTALL_URL="${MAESTRO_INSTALL_URL:-https://get.maestro.mobile.dev}"
INSTALL_RETRIES="${MAESTRO_INSTALL_RETRIES:-3}"
INSTALL_RETRY_DELAY_SECONDS="${MAESTRO_INSTALL_RETRY_DELAY_SECONDS:-3}"
MAESTRO_BIN_DIR="${MAESTRO_BIN_DIR:-$HOME/.maestro/bin}"

export PATH="$MAESTRO_BIN_DIR:$PATH"

if command -v maestro >/dev/null 2>&1; then
  maestro --version
  exit 0
fi

install_with_script() {
  curl -fsSL "$INSTALL_URL" | bash
}

install_with_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    return 1
  fi

  brew tap mobile-dev-inc/tap
  brew install mobile-dev-inc/tap/maestro
}

attempt=1
while [[ "$attempt" -le "$INSTALL_RETRIES" ]]; do
  echo "installing maestro via official installer (attempt ${attempt}/${INSTALL_RETRIES})"
  if install_with_script; then
    break
  fi

  if [[ "$attempt" -lt "$INSTALL_RETRIES" ]]; then
    sleep "$INSTALL_RETRY_DELAY_SECONDS"
  fi

  attempt=$((attempt + 1))
done

export PATH="$MAESTRO_BIN_DIR:$PATH"

if command -v maestro >/dev/null 2>&1; then
  maestro --version
  exit 0
fi

echo "official maestro installer failed, trying Homebrew"
if install_with_brew; then
  export PATH="$MAESTRO_BIN_DIR:$PATH"
fi

if command -v maestro >/dev/null 2>&1; then
  maestro --version
  exit 0
fi

echo "maestro installation failed; check network access to GitHub releases or preinstall maestro manually" >&2
exit 1
