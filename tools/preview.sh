#!/usr/bin/env bash
# Pull the latest changes and start the kernel-slice prototype at http://localhost:5173
# Run from anywhere:  bash ~/Documents/cad/tools/preview.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd prototypes/kernel-slice
npm install --no-audit --no-fund
exec npm run dev -- --open
