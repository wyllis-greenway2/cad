#!/usr/bin/env bash
# Rebuild the kernel (OpenCASCADE as WebAssembly) with the IGES reader and writer bound, for `dec_import_export_more`.
# Needs: Docker running and a network that reaches ghcr.io. It links, it does not compile OpenCASCADE.
#   tools/kernel-build/build.sh            the normal build (-O3: the same as the shipped kernel; wants about 8 GB of free memory)
#   LOW_MEM=1 tools/kernel-build/build.sh  a lighter link (-O1, no constructor pre-evaluation): bigger, slower wasm, about a third of the memory
#   MEM_GB=6 tools/kernel-build/build.sh   the most memory the container may take (default: half of what is free); at the limit only the container dies, not the computer
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
image="ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded" # (the image replicad-opencascadejs 1.1.0 was built with)
out="$here/out"

avail_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
disk_kb=$(df -Pk "$here" | awk 'NR==2 {print $4}')
echo "free memory $((avail_kb/1048576)) GB, swap $((swap_kb/1048576)) GB, free disk here $((disk_kb/1048576)) GB"
if [ "$disk_kb" -lt 8388608 ]; then echo "Less than 8 GB of free disk: the image unpacks to several GB. Free some space (docker system prune) and run again."; exit 1; fi
mem_gb="${MEM_GB:-$((avail_kb/1048576/2))}"
if [ "$mem_gb" -lt 2 ]; then echo "Under 4 GB of free memory: close programs, or add swap (sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile) and run again."; exit 1; fi
if [ "${LOW_MEM:-0}" != "1" ] && [ "$mem_gb" -lt 6 ]; then echo "Note: $mem_gb GB for the container is tight for -O3; if it is killed, use LOW_MEM=1."; fi

rm -rf "$out"; mkdir -p "$out"
cp -r "$here/custom_build_single.yml" "$here/wrappers" "$out/"
if [ "${LOW_MEM:-0}" = "1" ]; then sed -i -e 's/^  - -O3$/  - -O1/' -e '/EVAL_CTORS/d' "$out/custom_build_single.yml"; echo "LOW_MEM: -O1, no EVAL_CTORS"; fi

echo "Pulling the image (about 1 GB; a few GB unpacked)..."
docker pull "$image"
echo "Linking with at most ${mem_gb} GB..."
( cd "$out" && nice -n 10 docker run --rm --memory="${mem_gb}g" --memory-swap="${mem_gb}g" --cpus=2 -v "$(pwd):/src" -u "$(id -u):$(id -g)" "$image" link custom_build_single.yml )
ls -l "$out"/replicad_single.*
grep -c "IGESControl_Writer" "$out/replicad_single.d.ts" | sed 's/^/IGESControl_Writer mentions in the types (must be above 0): /'
echo "Done. Files: $out/replicad_single.js .wasm .d.ts"
