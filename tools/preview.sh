#!/usr/bin/env bash
# Pull the latest changes and start a prototype in your browser (http://localhost:5173).
# Usage:  bash ~/Documents/cad/tools/preview.sh [app|prototype]     default: app
#         LAN=1 bash ~/Documents/cad/tools/preview.sh          also reachable from a phone on the same Wi-Fi
#         app (the clean engine, default), or a prototype: cad-ui (frozen), sketch-extrude, kernel-slice
#         DEMO=0 starts the app empty (default: with the demo box)
set -euo pipefail
cd "$(dirname "$0")/.."
arg="${1:-app}"

# Step 1: pull, then re-run the freshly pulled copy of this script. Without this, a change to this very
# file only takes effect on the NEXT run (the old copy keeps executing after the pull).
if [ -z "${PREVIEW_PULLED:-}" ]; then
  git pull --ff-only
  PREVIEW_PULLED=1 exec bash tools/preview.sh "$arg"
fi

proto="$arg"
open_path="/"
dir="prototypes/$proto"
if [ "$arg" = "app" ]; then
  dir="app"
  [ "${DEMO:-1}" = "0" ] || open_path="/?demo=box"
fi

echo "Preview: $arg  |  commit $(git log -1 --format='%h %s')"
cd "$dir"
npm install --no-audit --no-fund
# --strictPort: if an older preview is still running on 5173, stop with a clear error instead of silently
# starting on another port (which makes you look at a stale tab).
# Phone or tablet on the same Wi-Fi:  LAN=1 bash tools/preview.sh   then open the address it prints on the phone.
if [ -n "${LAN:-}" ]; then
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "On your phone (same Wi-Fi) open:  http://${ip:-YOUR-LAPTOP-ADDRESS}:5173${open_path}"
  exec npm run dev -- --host --port 5173 --strictPort
fi
exec npm run dev -- --open "$open_path" --port 5173 --strictPort
