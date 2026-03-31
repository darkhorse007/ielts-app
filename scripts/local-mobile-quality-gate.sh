#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] running mobile unit and route smoke tests"
npm run test:mobile

echo "[2/3] running mobile iOS device smoke"
npm run smoke:e2e:mobile-ios-local

echo "[3/3] running mobile Android device smoke"
npm run smoke:e2e:mobile-android-local

echo "local mobile quality gate passed"
