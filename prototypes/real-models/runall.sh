#!/bin/bash
# each model in its own process: the kernel's memory is not freed between evaluations
cd "$(dirname "$0")"
OUT=/tmp/claude-0/-home-user-cad/2057ebb7-f514-518b-9e25-03eb02b58a09/scratchpad/real2
mkdir -p $OUT results; rm -f results/*.jsonl $OUT/*.txt
ls ../../app/test/fixtures/*.cad.json | xargs -n1 basename | xargs -P 4 -I{} sh -c 'timeout 150 node run.ts 120000 12 {} > '$OUT'/{}.txt 2>&1 || echo "TIMEOUT or crash" >> '$OUT'/{}.txt'
echo FINISHED > $OUT/DONE
