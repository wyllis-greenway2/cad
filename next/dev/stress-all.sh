#!/bin/sh
# the stress run in chunks of 15 models, each in a fresh process (the kernel leaks memory and aborts in the end; the app restarts its host the same way)
#   dev/stress-all.sh [models] [seed] [steps]
N=${1:-60}; SEED=${2:-1}; LEN=${3:-14}; i=0
while [ $i -lt $N ]; do
  j=$((i+14)); [ $j -ge $N ] && j=$((N-1))
  node --experimental-strip-types "$(dirname "$0")/stress.ts" $N $SEED $LEN $i-$j 2>&1 > /tmp/stress-chunk-$i.txt 2>&1 &
  i=$((i+15))
done
wait; grep -hE "^model |PROBLEMS|^[0-9]+ models" /tmp/stress-chunk-*.txt
