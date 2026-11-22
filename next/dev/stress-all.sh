#!/bin/sh
# the stress run in chunks of 15 models, each in a fresh process (the kernel leaks memory and aborts in the end; the app restarts its host the same way); 3 at a time (all processes share one memory limit)
#   dev/stress-all.sh [models] [seed] [steps]
N=${1:-60}; SEED=${2:-1}; LEN=${3:-14}; D=$(dirname "$0"); rm -f /tmp/stress-chunk-*
i=0; while [ $i -lt $N ]; do echo $i; i=$((i+15)); done | xargs -P 3 -I{} sh -c "j=\$(({}+14)); [ \$j -ge $N ] && j=$((N-1)); node --experimental-strip-types $D/stress.ts $N $SEED $LEN {}-\$j > /tmp/stress-chunk-{}.txt 2>&1"
grep -hE "^model |PROBLEMS|^[0-9]+ models" /tmp/stress-chunk-*.txt
