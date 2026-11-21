#!/bin/bash
# The kernel leaks a few MB per build (E17: the worker is to restart on a memory budget; not built yet), so the check runs in short processes of its own.
#   dev/engine-check-all.sh [processes] [sequences each]
cd "$(dirname "$0")/.."
P=${1:-15}; N=${2:-8}; fail=0
for seed in $(seq 1 $P); do
  out=$(node --experimental-strip-types dev/engine-check.ts $N $seed 2>&1 | grep -v "BindingError\|    at ") || fail=1
  echo "seed $seed: $(echo "$out" | head -3 | tr '\n' ' ')"
  echo "$out" | grep -q "VIOLATIONS" && echo "$out"
done
echo "processes: $P x $N sequences; failures: $fail"
