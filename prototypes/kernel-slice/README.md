# kernel-slice (THROWAWAY prototype)

Approved as an experiment in `in_012`; it does **not** decide the kernel decision (`dec_kernel_hybrid`). Never import this code
from production code (CLAUDE.md rule 9).

**Meant to learn:** can OCCT (via the replicad WASM build) handle a JSON operation graph for
printing-style parts, correctly and fast enough? Do references stay stable? What breaks?

## What is here
- `graphs/bracket.json`: operation graph (sketch, extrude, hole, fillet) with named parameters (`$w`...).
- `src/interpreter.mjs`: compiles the graph. Each op is isolated (failure is local), results pass OCCT's
  validity check, edge/face selection uses JSON queries not indices.
- `src/history.mjs`: experiment using OCCT's own modification history (`Generated`/`Modified`/`IsDeleted`)
  through the raw bindings, to keep named references alive across later operations.
- `src/worker.js`, `src/main.js`, `index.html`: browser view (Three.js), geometry in a Web Worker,
  sliders for every parameter.
- `test/graph.test.mjs`, `test/history.test.mjs`: 10 tests checked against closed-form volumes.
- `test/corpus.mjs`: 19 awkward boolean/fillet/chamfer/shell cases. Output in `corpus-results.md`.

## Run
```bash
cd prototypes/kernel-slice
npm install
npm test            # 10 tests
npm run corpus      # rewrites corpus-results.md
npm run dev         # browser view at http://localhost:5173
```
Or, from the repo root, `bash tools/preview.sh kernel-slice` pulls the latest changes, installs and starts the view.

## What we learned (2026-11-04; Node 22 and headless Chromium)
1. **Correctness on this kind of part is good.** 16 corpus cases with a closed-form volume all matched
   within 1.2e-11 relative error: all-edge fillets, a nearly spherical fillet (r=9.9 on a 20 mm cube),
   cylinder-edge fillet, a fillet next to a 0.2 mm wall, shell, Steinmetz cylinders, a 0.01 mm hole, a
   fillet on a rounded-rectangle extrusion. Coincident-face fuses, line-contact tangency and 1e-4 mm
   overlaps and gaps all came out exact **without any grid snapping** (relevant to `dec_grid_ui_only`).
2. **Failures can be silent.** Filleting every edge of a 20 mm cube with r=11 did not throw: OCCT returned a
   solid with volume 8980 (bigger than the 8000 cube). Its own validity check (`BRepCheck_Analyzer`) says
   invalid, so the interpreter now runs that check after every solid-producing op and fails the op.
3. **Error text is poor in the browser build.** OCCT failures can surface as an opaque
   `WebAssembly.Exception` with no message. We report a generic message. Real diagnostics need work.
4. **Index references are fragile; queries are better but not enough.** After a notch cut into the
   side wall, 8 of 15 edge indices pointed at different edges. A geometric query ("vertical edges on the
   outer boundary") still found the four corners, but after a corner notch from z=5 upward it also matched a
   5 mm stub of the corner edge without saying that the edge had been cut.
5. **OCCT's history gives exact answers.** Through a cut, named corner references were reported
   correctly as destroyed (through-notch), modified into a 5 mm stub (partial notch), or split into two
   8 mm pieces (window cut). Filleting the surviving named edges matched the closed-form volume. Caveat:
   replicad hides OCCT's operation objects, so this path needs our own thin wrapper over raw OCCT calls,
   and history through fillet, chamfer and shell is not yet tested.
6. **Speed is fine for now, with one watch item.** A 4-op bracket rebuilds in about 60 ms in the worker
   (about 320 ms on first load). 50 sequential hole cuts took 1.26 s (about 25 ms each, growing). The WASM file is
   23 MB (7 MB gzipped).

## What this does NOT show
- Only my 19 hand-written cases, mostly orthogonal geometry. No random or fuzz testing, no curved-surface
  pile-ups (fillet on fillet on fillet), no real-world imported parts.
- Volume agreement is necessary, not sufficient, for a correct solid (hence the validity check).
- No sketch constraints, no incremental rebuild or caching, no STEP/3MF/STL export, no undo.
- Browser tested in headless Chromium only (not Firefox, Safari or phones). No memory-limit tests.
- Pure-OCCT results say nothing about how a custom kernel would compare; that needs its own corpus run.
