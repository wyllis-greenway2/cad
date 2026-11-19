#!/usr/bin/env bash
# Rebuild the kernel (OpenCASCADE as WebAssembly) with the IGES reader and writer bound, for `dec_import_export_more`.
# Needs: Docker running, and network to ghcr.io (the image is about 1 GB). Takes a few minutes: it links, it does not compile OpenCASCADE.
# Run it from anywhere:  tools/kernel-build/build.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
image="ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded" # (the image replicad-opencascadejs 1.1.0 was built with)
out="$here/out"
rm -rf "$out"; mkdir -p "$out"
cp -r "$here/custom_build_single.yml" "$here/wrappers" "$out/"
( cd "$out" && docker run --rm -v "$(pwd):/src" -u "$(id -u):$(id -g)" "$image" link custom_build_single.yml )
ls -l "$out"/replicad_single.*
grep -c "IGESControl_Writer" "$out/replicad_single.d.ts" | sed 's/^/IGESControl_Writer mentions in the types (must be above 0): /'
echo "Done. Files: $out/replicad_single.js .wasm .d.ts"
