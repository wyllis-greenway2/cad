#!/usr/bin/env bash
# Pull the latest changes and start a prototype in your browser (http://localhost:5173).
# Usage:  bash ~/Documents/cad/tools/preview.sh [app|prototype]     default: app
#         LAN=1 bash ~/Documents/cad/tools/preview.sh          also reachable from a phone on the same Wi-Fi
#         app (default), or a prototype: cad-ui (frozen), sketch-extrude, kernel-slice
#         DEMO=1 starts the app with the demo box (default: empty)
#         PULL_EVERY=60 also pulls every 60 seconds while the preview runs (fast-forward only), so what is merged into
#         the branch you have checked out shows up by itself (the page reloads). Off unless set. A change to
#         app/package.json still needs a restart (npm install runs at the start only).
set -euo pipefail
cd "$(dirname "$0")/.."
arg="${1:-app}"

# Step 1: pull, then re-run the freshly pulled copy of this script. Without this, a change to this very
# file only takes effect on the NEXT run (the old copy keeps executing after the pull).
if [ -z "${PREVIEW_PULLED:-}" ]; then
  git pull --ff-only
  PREVIEW_PULLED=1 exec bash tools/preview.sh "$arg"
fi

# Optional: keep pulling in the background while the preview runs (a failed pull, such as local edits in the way, is only
# reported and tried again next time). The loop stops with the preview.
if [ -n "${PULL_EVERY:-}" ]; then
  root="$PWD"
  ( while sleep "$PULL_EVERY"; do
      before="$(git -C "$root" rev-parse HEAD)"
      if git -C "$root" pull --ff-only -q 2>/dev/null; then
        after="$(git -C "$root" rev-parse HEAD)"
        [ "$before" != "$after" ] && echo "Pulled: now $(git -C "$root" log -1 --format='%h %s' | cut -c1-90)"
      else
        echo "Pull skipped (not a fast-forward, or local changes in the way); will try again"
      fi
    done ) &
  pull_pid=$!
  trap 'kill "$pull_pid" 2>/dev/null || true' EXIT INT TERM
fi

proto="$arg"
open_path="/"
dir="prototypes/$proto"
if [ "$arg" = "app" ]; then
  dir="app"
  if [ "${DEMO:-0}" = "1" ]; then open_path="/?demo=box"; fi
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
  if [ -n "${PULL_EVERY:-}" ]; then npm run dev -- --host --port 5173 --strictPort; exit $?; fi
  exec npm run dev -- --host --port 5173 --strictPort
fi
if [ -n "${PULL_EVERY:-}" ]; then npm run dev -- --open "$open_path" --port 5173 --strictPort; exit $?; fi
exec npm run dev -- --open "$open_path" --port 5173 --strictPort
