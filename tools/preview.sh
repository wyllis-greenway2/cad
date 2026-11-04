#!/usr/bin/env bash
# Pull the latest changes and start a prototype in your browser (http://localhost:5173).
# Usage:  bash ~/Documents/cad/tools/preview.sh [prototype]     default: cad-ui
#         prototypes: cad-ui (clean interface, staged), sketch-extrude, kernel-slice
set -euo pipefail
cd "$(dirname "$0")/.."
proto="${1:-cad-ui}"

# Step 1: pull, then re-run the freshly pulled copy of this script. Without this, a change to this very
# file only takes effect on the NEXT run (the old copy keeps executing after the pull).
if [ -z "${PREVIEW_PULLED:-}" ]; then
  git pull --ff-only
  PREVIEW_PULLED=1 exec bash tools/preview.sh "$proto"
fi

echo "Preview: $proto  |  commit $(git log -1 --format='%h %s')"
cd "prototypes/$proto"
npm install --no-audit --no-fund
# --strictPort: if an older preview is still running on 5173, stop with a clear error instead of silently
# starting on another port (which makes you look at a stale tab).
exec npm run dev -- --open --port 5173 --strictPort
