---
id: dec_drag_preview_without_kernel
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_216, in_217, in_218, in_219, in_220, in_221, in_222, in_223, in_224, in_225, in_226, in_227, in_323, in_325, in_326, in_327, in_328, in_329, in_330, in_331
date: 2026-11-14
depends_on:
  - dec_face_edit_by_step: the picture while dragging is now literally what the edit of the step makes (the kernel's result for it); a change to how a face edit is made changes what is drawn
  - dec_sketch_follows_body: a body moved whole is drawn by a matrix with its sketches carried the same way (`follow`)
  - prin_graph_is_truth: nothing is stored; the kernel's answer for the step is the truth, and the picture is that answer at the size the pointer is at
  - inv_kernel_boundary: the kernel is asked through the same boundary (a graph in, a result out), with two flags that make the answer cheaper: `draft` and `lite`
---
# While a handle is dragged the picture is a matrix or the kernel's own result, never an estimate

**What is drawn.** While the pointer drags a handle of an operation:
- a **move, turn or uniform scale of the whole body** is drawn by a matrix on the graphics card (the body's mesh moved; its sketches carried by the same numbers). A rigid motion, or a uniform scale, is exact: there is no guess in it, and the kernel is not asked;
- **everything else** (a new or pulled fillet or chamfer, the end of an extrusion or a push / pull prism, the wall of a round face, a side or an arc of a sketch, an extrusion, a repeat) is drawn from **the kernel's own result for the size the pointer is at**, the newest request winning (the kernel keeps only the newest request and cannot stop one that has begun, so a size waits for the one in progress and the sizes in between are dropped). The request is *rough* (`draft`: a coarse mesh) and *lite* (the mesh, volume and box, and the names and boxes of the bodies, but no faces, edges or corners: `kernel.lite`, `occt/evaluate.mjs`; asked for and cached apart from the whole answer, `kernel-async.ts`). The whole fine answer, with the faces and edges, is made when the pointer is let go.

So the picture of a size cannot disagree with what is made at that size: it is the same step worked out by the same kernel. (`test/exactpreview.test.ts`: for a new and an existing fillet, a chamfer, the end of an extrusion, a side, the wall of a hole, the picture's volume is the result's.)

**What was removed (`in_331`).** An earlier way stretched a reference the kernel made on the graphics card: a prism along its normal, a wall out from its axis, corners moved as the solver would, a fillet or chamfer scaled about its sharp edge. It was fast and exact where its rules held, but its rules were guesses about which faces move and how, and they failed for shapes nobody had tried: a wall of a small block was taken for the rounding of a fillet and folded the block into a slab, in the picture only, while the step that was made was right (`in_323`). A check of the stretched picture against the kernel's answer was built (`in_325`) and then made unnecessary. The stretch, the check, `roundingFaces` and the rest of `operation/roundings.ts`, and the renderer's stretch of a face are gone; git has them.

**Measured (`in_326`, `in_327`, `in_329`; the human's two models; headless Chromium in a sandbox with few cores, so the browser numbers are only good for comparing).**
- The kernel's time for one exact preview, rough and lite, alone: a fillet or chamfer about 40 ms on the model with the hole and 7 ms on two blocks (whole and fine: 75 to 81 and 19 ms); the wall of a hole 36 ms; the end of an extrusion 47 ms (whole: 161); a move, turn or scale of a body 7 ms. Only the operation itself takes time (28 to 48 ms for the fillet); the steps before it come from the kernel's cache. Leaving out the faces and edges is about half of the saving; the rough mesh the rest.
- The page's own time per frame, with the stretch / with the exact picture (average ms): two blocks 5.4 / 5.3, holed model 7.9 / 5.7, at normal speed; 20.5 / 15.7 and 30.5 / 26.5 with the CPU four times slower. The exact picture is no dearer, and cheaper where it leaves out the faces and edges the page would have had to build.
- How far the picture runs behind the pointer, in the sandbox, from asking the kernel to its answer (median / p95 ms): holed model 190 / 292 (79 waiting for the job before it, 100 the kernel's own time), two blocks 47 / 60; then up to a frame. About a quarter of a second behind on the holed model and a tenth on the blocks there; from the kernel's own times, on a machine with a graphics card and more cores, an estimate of 60 to 110 ms and 15 to 30 ms (not measured).

**Costs that stay.** The mesh is rough while the pointer is down (the curve of a fillet shows its facets). On a large model the picture follows the pointer at the kernel's rate (about 25 updates a second on the model with the hole, from the kernel's time alone). A refused size shows the kernel's message and the picture it had. The selection's highlight of a face of the body is not in a lite answer, so it is not drawn while the pointer is down; the arrow and the number are (they come from the model before the drag).

**What was not measured:** a machine with a graphics card; models larger than the two used; the lag at the speed of a hand with a real pointer (the pointer was scripted in the page).

## Rationale

Direct manipulation has to follow the pointer (`prin_function_over_form`; the human asked in `in_206`, `in_215`, `in_216` for the real object and surfaces to move, not a wireframe). A rigid motion can be drawn exactly with no kernel, so it is. Everything else was drawn by a stretch whose rules had to guess, and a picture that disagrees with the result is a bug of a kind that cannot be tested out (`in_323`); once the exact picture was measured to cost about the same, from 7 to 50 ms of the kernel for what the human's models need, the human decided (`in_328`, `in_331`) that the kernel's own result is the one method, so that no preview can be out of step with the result. The kernel boundary is unchanged in kind: the same graph in, the same kind of result out, with `draft` (a coarse mesh) and `lite` (no faces, edges or corners) asked for by the page while the pointer is down.
