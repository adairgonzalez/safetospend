#!/bin/bash
# Installs Safe-to-Spend as a macOS launchd service: starts on boot,
# restarts on crash, runs deploy-watch.sh (server + auto-deploy).
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.safetospend.plist"

if ! command -v node >/dev/null; then
  echo "node not found in PATH; install Node first" >&2; exit 1
fi
NODE_DIR="$(dirname "$(command -v node)")"

if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 5001 is already in use — stop the app you started manually" >&2
  echo "(Ctrl+C in its terminal), then run this script again." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.safetospend</string>
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
  <key>StandardOutPath</key><string>/tmp/safetospend.log</string>
  <key>StandardErrorPath</key><string>/tmp/safetospend.log</string>
</dict></plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

sleep 3
if launchctl list | grep -q com.safetospend; then
  echo "Installed and running. The app now starts on boot and auto-deploys pushes."
  echo "Logs: tail -f /tmp/safetospend.log"
  echo "Stop it: launchctl unload $PLIST"
else
  echo "Something went wrong — check /tmp/safetospend.log" >&2; exit 1
fi
