---
id: dec_sharp_edges_once
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_468
date: 2026-11-15
depends_on:
  - dec_kernel_hybrid: the kernel's thread answers with plain data (the same mesh arrays while nothing changed) that the page draws
alternative_to:
---
# The sharp edges of a mesh are found once on the page (step 1)

**Decided (`in_468`): step 1 only.** `cornerEdges` (`ui/view/edges.ts`) is remembered by the mesh it was made from (`cornerEdgesOf`: the same vertex, normal and triangle arrays and the same angle give the same list), so a rebuild of the picture for a changed scene with the same mesh (a sketch moved, a selection, the picture that waits for the kernel) does not search the triangles again. What is drawn does not change: the same rule on the same mesh. The list returned is shared and must not be changed. Step 2 (finding the edges in the kernel's thread, once per body) is not decided: `q_sharp_edges_in_kernel`.

**Measured** (`really_slow.json`, headless Chromium; `in_464`, `in_466`, `in_467`): after every edit the page's own thread is held for about 150 ms and the kernel's answer waits behind it; `buildContent` (`ui/view/content.ts`) ran twice per edit at 25 to 45 ms a time, nearly all of it `cornerEdges` over about 11 000 triangles. With step 1 the average build is about 14.5 ms (the second build of an edit costs nothing for the edges) and the round trip of an edit 117 to 143 ms (it was 150 to 190).

## Rationale

The wait after an edit is the page's own thread, not the kernel (`in_466`). The one piece of that work that grows with the size of the *whole* model and not with what changed, and that was measured, is the search for sharp edges; remembering it by the mesh is the smallest change that takes the repeat out and has no effect on what is drawn.
