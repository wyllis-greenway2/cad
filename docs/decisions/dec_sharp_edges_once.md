---
id: dec_sharp_edges_once
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_468, in_469
date: 2026-11-15
depends_on:
  - dec_kernel_hybrid: the kernel's thread answers with plain data (the same mesh arrays while nothing changed) that the page draws
alternative_to:
---
# The sharp edges of a body are found once (step 1 on the page, step 2 in the kernel's thread)

**Decided: step 1 (`in_468`) and step 2 (`in_469`).** `cornerEdges` (`ui/view/edges.ts`) is remembered by the mesh it was made from (`cornerEdgesOf`: the same vertex, normal and triangle arrays and the same angle give the same list), so a rebuild of the picture for a changed scene with the same mesh (a sketch moved, a selection, the picture that waits for the kernel) does not search the triangles again. What is drawn does not change: the same rule on the same mesh. The list returned is shared and must not be changed. **Step 2:** the kernel's thread finds the sharp edges of each body when it describes it (`describeSolid` in `evaluate.mjs`, the search itself in `occt/sharp.mjs`, shared with the page's `cornerEdges`), keeps them with the body's description (so a body that did not change costs nothing, and they are found for each body alone, not over a mesh in which two bodies meet), and sends them in the answer as `mesh.sharp` (lines of two ends, x y z) with `mesh.sharpDeg`, the angle they were found for (30, the page's `settings.extrude.edgeAngleDeg`). The page uses them when `sharpDeg` is the angle it wants (`cornerEdgesOf`), else searches itself as in step 1 (a mesh from an older answer, another setting). The kept answers of `dec_description_cache` carry them too (the kernel's source is part of their key, so older ones are not read).

**Measured** (`really_slow.json`, headless Chromium; `in_464`, `in_466`, `in_467`): after every edit the page's own thread is held for about 150 ms and the kernel's answer waits behind it; `buildContent` (`ui/view/content.ts`) ran twice per edit at 25 to 45 ms a time, nearly all of it `cornerEdges` over about 11 000 triangles. With step 1 the average build was about 14.5 ms; with step 2 it is 0.6 ms (the page searches no triangles). **The round trip of an edit did not fall with it** (141 to 174 ms in the same headless run, 117 to 143 before; the noise of a run is about 30 ms): the page's long task after an edit (120 to 160 ms) is not `buildContent`; it is the browser's own work and drawing (`(program)` in a CPU profile).

## Rationale

The wait after an edit is the page's own thread, not the kernel (`in_466`). The one piece of that work that grows with the size of the *whole* model and not with what changed, and that was measured, is the search for sharp edges; remembering it by the mesh is the smallest change that takes the repeat out and has no effect on what is drawn.
