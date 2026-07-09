#!/bin/bash
# Installs this checkout of Safe-to-Spend as a macOS launchd service:
# starts on boot, restarts on crash, runs deploy-watch.sh (server +
# auto-deploy). Each checkout (e.g. safetospend, safetospend-qa) gets
# its own service, named after its folder, using the PORT in its .env.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$REPO")"
LABEL="com.safetospend.${NAME}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if ! command -v node >/dev/null; then
  echo "node not found in PATH; install Node first" >&2; exit 1
fi
NODE_DIR="$(dirname "$(command -v node)")"

PORT="$(grep '^PORT=' "$REPO/.env" 2>/dev/null | cut -d= -f2- || true)"
PORT="${PORT:-5001}"

# Migrate the pre-instance-aware install if it pointed at this checkout
LEGACY="$HOME/Library/LaunchAgents/com.safetospend.plist"
if [ -f "$LEGACY" ] && grep -q "${REPO}/deploy-watch.sh" "$LEGACY"; then
  launchctl unload "$LEGACY" 2>/dev/null || true
  rm -f "$LEGACY"
fi

launchctl unload "$PLIST" 2>/dev/null || true
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use — stop the app you started manually" >&2
  echo "(Ctrl+C in its terminal), then run this script again." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>${REPO}/deploy-watch.sh</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>WorkingDirectory</key><string>${REPO}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/${NAME}.log</string>
  <key>StandardErrorPath</key><string>/tmp/${NAME}.log</string>
</dict></plist>
EOF

launchctl load "$PLIST"

sleep 3
if launchctl list | grep -q "$LABEL"; then
  echo "Installed and running: $LABEL on port $PORT (branch $(git -C "$REPO" rev-parse --abbrev-ref HEAD))"
  echo "Logs: tail -f /tmp/${NAME}.log"
  echo "Stop it: launchctl unload $PLIST"
else
  echo "Something went wrong — check /tmp/${NAME}.log" >&2; exit 1
fi
