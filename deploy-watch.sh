#!/bin/bash
# Runs Safe-to-Spend and auto-deploys new commits pushed to this branch:
# checks origin every 60s; on new commits it pulls, installs, rebuilds the
# client, restarts the server, and pings your phone via ntfy.
set -u
cd "$(dirname "$0")"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SERVER_PID=""

notify() {
  local topic
  topic=$(grep '^NTFY_TOPIC=' .env 2>/dev/null | cut -d= -f2-)
  [ -n "$topic" ] && curl -s -o /dev/null -H "Title: $1" -d "$2" "https://ntfy.sh/$topic"
}

install_and_build() {
  (cd server && npm install --no-audit --no-fund --silent) &&
  (cd client && npm install --no-audit --no-fund --silent && npm run build)
}

start_server() {
  (cd server && exec node index.js) &
  SERVER_PID=$!
}

stop_server() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null
}
trap 'stop_server; exit 0' INT TERM

[ -d client/build ] || install_and_build
start_server
echo "Safe-to-Spend running at commit $(git rev-parse --short HEAD); watching origin/$BRANCH for updates"

while true; do
  sleep 60
  git fetch origin "$BRANCH" --quiet 2>/dev/null || continue
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null) || continue
  [ "$LOCAL" = "$REMOTE" ] && continue
  echo "New commits on $BRANCH — deploying..."
  git pull --rebase --quiet origin "$BRANCH" || { echo "git pull failed; will retry"; continue; }
  if install_and_build; then
    stop_server
    start_server
    echo "Deployed $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"
    notify "App updated 🚀" "Deployed: $(git log -1 --pretty=%s)"
  else
    echo "Build failed — old version still running"
    notify "Deploy failed ❌" "Build error at $(git rev-parse --short HEAD) — old version still running"
  fi
done
