---
id: dec_sharp_edges_once
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_464, in_466, in_467
date: 2026-11-15
depends_on:
  - dec_description_cache: the per-body description (mesh, faces, edges) is kept by what the body looks like; the sharp edges of a body would be kept with it
  - dec_kernel_hybrid: the kernel's thread answers with plain data that the page draws; this moves one more piece of work from the page to that thread
alternative_to:
---
# Find the sharp edges of a body once, not at every rebuild of the picture

**Proposed, not approved.** Measured on `really_slow.json` (`in_464`, `in_466`, `in_467`; headless Chromium): after every edit the page's own thread is held for about 150 ms and the kernel's answer waits behind it. Of that, `buildContent` (`ui/view/content.ts`) takes 25 to 45 ms a time and it runs **twice** per edit (once for the picture that waits, once for the answer); nearly all of it (about 26 of 27 ms) is `cornerEdges`, which looks at every triangle of the whole mesh (11 000 in this file, mostly the lofts) to find where the surface turns by more than 30 degrees. The mesh of a body that did not change is the same mesh, so the same edges.

**Two steps, the first one alone is worth doing:**
1. **On the page: keep the edges of a mesh.** `cornerEdges` is remembered by the mesh it was made from (the same arrays), so a rebuild of the picture for a changed scene with the same mesh (the sketch moved, a selection) finds them again, and the second build of an edit costs nothing for them. Touches `ui/view/content.ts` only.
2. **In the kernel's thread: find them once per body.** The thread finds the sharp edges of each body when it describes it, keeps them with the description (`dec_description_cache`), and sends them in the answer; the page draws them and no longer scans triangles. A block edit beside lofts then costs the edges of the block only. The answer gets one more array (the edge lines, about as large as the edges already sent); the cached answers of `dec_description_cache` grow by it and their key already changes with the kernel's source, so old ones are not read.

**Not part of this:** keeping a separate drawn geometry per body on the page (the buffers uploaded to the graphics card for each body on its own). That would take more, and the first measure to take before it is how much of the rest of the 150 ms is the page's geometry and how much the browser's own work (`(program)` in a CPU profile).

## Rationale

The wait after an edit is the page's own thread, not the kernel (`in_466`): 32 to 55 ms in the kernel, 100 to 135 ms for the answer to come back behind the page's work. The one piece of that work that grows with the size of the *whole* model (and not with what changed) and that is measured is the search for sharp edges, so it is the cheapest thing to take out. It has no effect on what is drawn: the same edges from the same mesh by the same rule (`settings.extrude.edgeAngleDeg`). The risk is the second step's larger answer and its cached copies; the first step has none.
