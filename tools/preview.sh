#!/usr/bin/env bash
# Pull the latest changes and start a prototype in your browser (http://localhost:5173).
# Usage:  bash ~/Documents/cad/tools/preview.sh [prototype]     default: sketch-extrude
#         prototypes: sketch-extrude, kernel-slice
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd "prototypes/${1:-sketch-extrude}"
npm install --no-audit --no-fund
exec npm run dev -- --open
