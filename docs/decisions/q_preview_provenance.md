---
id: q_preview_provenance
kind: question
status: open
origin: ai-unreviewed
human_input: in_323, in_324, in_325, in_326, in_327
date: 2026-11-14
depends_on:
  - dec_drag_preview_without_kernel: the question is how to make that decision's stretched picture right by construction; a change to it (an exact preview) would end the question
alternative_to:
---
# Should the kernel say which faces an operation made, so the preview does not have to guess

**Status after `in_325`:** option (b) is built (`dec_drag_preview_without_kernel`): the stretched picture is checked against the kernel's answer and given up for the kernel's own preview when they differ. (a) and (c) are not started; what stays open here is whether (a) is still wanted once the check has shown, in real use, how often the stretch is wrong (`previewChecks` in the state snapshot says).

**Why it comes up.** While a fillet or chamfer size is dragged, the picture stretches a reference the kernel made (`dec_drag_preview_without_kernel`). It has to decide which faces are "the rounding", and did so by distance from the edge (`roundingFaces`); on a small block that took a wall for the rounding and folded the block (`in_323`). That was fixed by tightening the distance, which is still a guess. The question after `in_323`: can the kernel simply say?

**What the kernel can report (`in_324`, looked at in the compiled kernel, nothing built).** OpenCASCADE's operation objects keep a history: `Generated(shape)` (the new faces made from an edge or a vertex), `Modified(shape)` (what an old face became) and `IsDeleted(shape)`. The compiled kernel has them on `BRepFilletAPI_MakeFillet`, `BRepFilletAPI_MakeChamfer`, the boolean operations (`BRepAlgoAPI_BuilderAlgo`) and `BRepPrimAPI_MakePrism`. Tried on a real block in the kernel's own wasm: one vertical edge, filleted or chamfered: `Generated(edge)` is exactly the one new face, found in the result by `hashCode`; four of the six old faces are `Modified`, none deleted. Three edges meeting at a corner: four new faces (three strips and the corner patch), every one of them given by `Generated` of the edges or the corner's vertex. The lists have only `First`, `Last`, `RemoveFirst` and `Size` (no iterator): they are read by taking the first until empty, as the library's own wrapper does.

**What is in the way.** The library we use for the solids (replicad) makes the builder inside `fillet` / `chamfer`, returns the shape and throws the builder away, so the history cannot be asked through it. The interpreter (`compiler/kernel/occt/interpreter.mjs`, `edgeMod`) would have to make the builder itself (it can: it already reaches the kernel's objects through `getOC`), keep it until it has read the history, and put the answer into the face list (`evaluate.mjs` already maps each face of the final shape to its mesh range by `hashCode`). That answer, a mark on a face saying "made by the last fillet / chamfer step", then has to travel with the face description (it is cached by body and sent from the worker). The interpreter's way of trying edges alone, then together, then a corner (`edgeMod`) would have to keep the history of the try that worked.

**What it would not settle.** The history says which faces are new and which old faces changed; it does not say how the vertices of the others move when the size changes. The stretch still moves the neighbours' boundary vertices by a rule (found by position), which is a second guess. It would be narrower (only the faces the history says changed, only their vertices on the new faces), not gone.

**Options.** (a) Provenance from the kernel for the face choice, as above. (b) Compare the stretched picture with the kernel's answer when it arrives and replace it if they differ (catches any wrong guess, not only this one). (c) Exact preview with the latest request winning, stretch only as a bridge. They can be combined; (a) and (b) are each small to medium work, (c) changes how slow models drag.

## Measured: option (c), the kernel's own result for every size (`in_326`)

Tried as an experiment (`settings.preview.stretch` off; on by default, nothing changed for users), with the human's two models, in Chromium (headless: software drawing, so only the comparison is fair, not the absolute rates) and with the kernel timed on its own.
- **Kernel, one exact fillet or chamfer preview:** two blocks about 15 ms; the holed model about 90 ms (42 to 142), of which about 31 ms is the operation and about 55 ms the mesh of both bodies and the naming of faces and edges; the rough mesh did not help (101 ms).
- **Frame on the main thread, stretch / exact (ms, average):** two blocks 4.2 / 3.7 at normal speed, 16.5 / 16.8 with the CPU four times slower; holed model 7.1 / 8.9 and 28.1 / 40.0. Exact fits the frame at normal speed on both; on the slow setting the holed model is over a frame either way, and exact costs about 40 % more, mostly (20 ms against 5) from rebuilding the drawn objects for every new kernel mesh, not from asking the kernel.
- **Not measured:** how far the exact picture runs behind the pointer (the first measure read a value that is always current and was dropped). From the kernel times: about 15 to 30 ms on the blocks, 90 to 140 ms on the holed model, about 11 updates a second there.
- **Cheaper exact (`in_327`), built behind the same switch (off by default):** while a size is dragged and the kernel's own result is shown, the request is also *lite*: the mesh, volume and box, no faces, edges or corners (`lite` on the kernel, in the async kernel's key and the worker's message, `evaluate.mjs`), and rough (`draft`). Kernel time per preview, holed model: whole and fine 75 to 81 ms, rough 54 to 57, rough and lite 38 to 40 (operation 21, mesh 12, bodies' boxes 5); two blocks 19, 13, 7. Only the fillet itself takes time (28 to 48 ms); the earlier steps come from the kernel's cache. About 25 updates a second on the holed model (from 11), over a hundred on the blocks. The lite answers also make the page's own work smaller (fewer parts to build): frame time, stretch / exact, average ms: two blocks 5.4 / 5.3 at normal speed and 20.5 / 15.7 with the CPU four times slower; holed model 7.9 / 5.7 and 30.5 / 26.5. So exact is no longer dearer than the stretch in the page's time, and cheaper on the holed model; on the slow setting both are over a frame on the holed model.
- **Not built:** meshing only the changed body (an estimated 3 ms of the 12 at most: the unchanged body is a small part of the mesh); reusing the drawn objects of an unchanged body (the body is one mesh and one object; what the page spends per new mesh is about 1.4 ms, of which the outline detection `cornerEdges` is about 1; the rest of the saving came from the lite answer's fewer parts).
- **Cost of the exact preview that stays:** the mesh is rough while the pointer is down (the curves of a fillet show their facets), and the fine one, with the faces and edges, comes when it is let go; and how far the picture runs behind the pointer was not measured (about 40 to 60 ms on the holed model and about 10 ms on the blocks, from the kernel times).

## Rationale

The human asked (`in_323`) why the preview can disagree with the result and how it could be fast and right, and asked for what the kernel can report to be looked at first (`in_324`). Nothing is decided: this records what was found so the choice can be made on it.
