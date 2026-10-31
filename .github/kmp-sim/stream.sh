#!/bin/bash
# kmp-sim-template-version: 2
set -euo pipefail

PRODUCTS_DIR="$RUNNER_TEMP/DerivedData/Build/Products/Debug-iphonesimulator"
APP_PATH="$(find "$PRODUCTS_DIR" -maxdepth 1 -type d -name '*.app' -print -quit)"
[ -n "$APP_PATH" ] || { echo "No built iOS app found in $PRODUCTS_DIR"; exit 1; }
[ -n "${SIMULATOR_UDID:-}" ] || { echo "SIMULATOR_UDID is required"; exit 1; }
[ -n "${KMP_SIM_GATE_TOKEN:-}" ] || { echo "KMP_SIM_GATE_TOKEN is required"; exit 1; }
[ "${KMP_SIM_MINUTES:-}" -gt 0 ] 2>/dev/null && [ "$KMP_SIM_MINUTES" -le 350 ] || {
  echo "KMP_SIM_MINUTES must be a number from 1 to 350"
  exit 1
}

BUNDLE_ID="$(sed -n 's/^PRODUCT_BUNDLE_IDENTIFIER=//p' app/iosApp/Configuration/Config.xcconfig | head -1)"
BUNDLE_ID="${BUNDLE_ID%%\$*}"
[ -n "$BUNDLE_ID" ] || { echo "Could not read the iOS bundle identifier"; exit 1; }

xcrun simctl install "$SIMULATOR_UDID" "$APP_PATH"
xcrun simctl launch "$SIMULATOR_UDID" "$BUNDLE_ID"

npx --yes @expo/serve-sim \
  --codec mjpeg \
  --mjpeg-fps 20 \
  --max-dimension 900 \
  --port "$STREAM_PORT" \
  "$SIMULATOR_UDID" > serve-sim.log 2>&1 &
SERVE_SIM_PID=$!

STREAM_READY=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:$STREAM_PORT/readyz"; then
    STREAM_READY=1
    break
  fi
  if ! kill -0 "$SERVE_SIM_PID" 2>/dev/null; then
    break
  fi
  sleep 2
done
[ "$STREAM_READY" -eq 1 ] || { echo "iOS simulator stream never became ready"; cat serve-sim.log; exit 1; }
echo "iOS simulator stream started"

env KMP_SIM_GATE_TOKEN="$KMP_SIM_GATE_TOKEN" \
  KMP_SIM_TARGET_PORT="$STREAM_PORT" \
  KMP_SIM_GATE_PORT="$GATE_PORT" \
  nohup node .github/kmp-sim/gate.cjs > gate.log 2>&1 &
GATE_PID=$!

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$GATE_PORT/__kmp-sim/healthz" && break
  kill -0 "$GATE_PID" 2>/dev/null || break
  sleep 1
done
curl -fsS "http://127.0.0.1:$GATE_PORT/__kmp-sim/healthz" || {
  echo "gate never became ready"
  cat gate.log 2>/dev/null || true
  exit 1
}

touch cloudflared.log
curl -fsSL -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64
chmod +x cloudflared
nohup ./cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$GATE_PORT" --logfile cloudflared.log > /dev/null 2>&1 &
CLOUDFLARED_PID=$!

TUNNEL=""
for _ in $(seq 1 60); do
  TUNNEL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared.log | head -1 || true)
  [ -n "$TUNNEL" ] && break
  kill -0 "$CLOUDFLARED_PID" 2>/dev/null || break
  sleep 2
done
[ -n "$TUNNEL" ] || { echo "cloudflared never became ready"; tail -50 cloudflared.log; exit 1; }

gh api "repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" \
  -f state=success \
  -f "context=$STATUS_CONTEXT" \
  -f "target_url=$TUNNEL/?k=$KMP_SIM_GATE_TOKEN" \
  -f "description=iOS Simulator live; hold for ${KMP_SIM_MINUTES}m" > /dev/null

END=$(( $(date +%s) + KMP_SIM_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$END" ]; do
  curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$STREAM_PORT/healthz"
  sleep 15
done
