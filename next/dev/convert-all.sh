#!/bin/bash
# Convert every dumped model, each in its own process (the kernel's memory is not freed between models), four at a time.   dev/convert-all.sh > rows.txt
cd "$(dirname "$0")/.."
ls ../prototypes/real-models/dump/*.json | xargs -n1 basename | sed 's/\.json$//' | xargs -P 4 -I{} sh -c 'timeout 120 node --experimental-strip-types dev/convert-old.ts {} 2>&1 | grep -v "BindingError\|    at " | head -1 || echo "{}   TIMEOUT"'
