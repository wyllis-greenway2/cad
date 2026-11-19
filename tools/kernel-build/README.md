# Kernel build with IGES

The app's kernel is `replicad-opencascadejs` 1.1.0, a prebuilt OpenCASCADE (WebAssembly) that has the IGES code inside but does not expose its reader and writer. This folder is the build recipe of that package (from replicad's repository, commit `e4b05f6`, v1.1.0) with three symbols added to `custom_build_single.yml`: `IGESControl_Writer`, `IGESControl_Controller`, `IGESControl_Reader`.

Run `tools/kernel-build/build.sh` (Docker, and a network that reaches `ghcr.io`). It checks free memory and disk first and caps the container's memory, so a shortage stops the container, not the computer; `LOW_MEM=1` links with less memory (`-O1`, a larger wasm) and `MEM_GB=n` sets the cap. The first run on a 16 GB machine without a cap took the machine down, which is why. It writes `out/replicad_single.js`, `.wasm` and `.d.ts`. Then tell the AI: it puts them in the app (and records the licence care for a custom LGPL build in `docs/licenses.md`) and builds IGES import and export on them.

Not checked yet (could not be run where this was written): that the image contains the IGES libraries. If the link fails with undefined IGES symbols, the image needs rebuilding from OpenCASCADE's sources with `TKDEIGES` included; send the error.
