#!/bin/sh
# every family, in chunks of fresh processes (the kernel leaks memory), three at a time
#   dev/stress-families.sh [models per family] [seed] [steps]
N=${1:-30}; SEED=${2:-1}; LEN=${3:-8}; D=$(dirname "$0"); rm -f /tmp/fam-*
for f in curved sketch params document exchange place; do i=0; while [ $i -lt $N ]; do echo "$f $i"; i=$((i+15)); done; done | xargs -P 3 -L 1 sh -c "j=\$((\$1+14)); [ \$j -ge $N ] && j=$((N-1)); node --experimental-strip-types $D/stress-families.ts \$0 $N $SEED $LEN \$1-\$j > /tmp/fam-\$0-\$1.txt 2>&1"
for f in /tmp/fam-*.txt; do echo "== $f"; grep -v '^Aborted' $f | grep -E "^[0-9]+ models|PROBLEMS|^model " | cut -c1-300; done
