---
id: dec_drag_preview_without_kernel
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_216, in_217, in_218, in_219, in_220, in_221, in_222, in_223, in_224, in_225, in_226, in_227, in_323, in_325
date: 2026-11-07
depends_on:
  - dec_face_edit_by_step: the picture while dragging must be what the edit of the step makes; this only draws it sooner
  - dec_sketch_follows_body: edits after a move or turn rely on the sketch being carried with the body (`follow`)
  - prin_graph_is_truth: nothing is stored; the kernel's answer for the step is still the truth and replaces the picture
  - inv_kernel_boundary: the kernel is asked as before; the preview only reuses the mesh it already gave
---
# A body being dragged is drawn on the graphics card; the kernel is asked once, when the pointer is let go

The kernel takes about 100 ms to answer for a model (most of it meshing the body and classifying its faces), which is too slow for a drag. While a handle is dragged the picture is therefore made without the kernel wherever the new shape is the old one transformed, and the kernel works the real step out when the pointer is let go; its answer replaces the picture. The picture stays where it was put until the answer comes (it never jumps back).

**Cases drawn without the kernel** (each when the step it changes is the last one, or only moves and turns of the whole body come after it; anything else goes to the kernel, with a rough "draft" mesh while dragging):
- a whole-body move, turn or scale: the body's mesh moved by a matrix (nothing asked of the kernel);
- the end face of an extrusion or push / pull prism: the face's points and the walls beside it stretched along the normal;
- the wall of an extruded circle (also about tilted axes): points out from / in towards the axis;
- a straight side of an extruded sketch: its corners moved as the solver would move them, with the points over them (arcs in the sketch are mapped from the old arc to the new one, only if the arc keeps equal-distance ends);
- the wall of an arc whose circle is gone: out from the middle and along the arc to where its ends slide to on their lines;
- a fillet or chamfer of any size: the same cross-section scaled about the sharp edge (a line, or a circle), edge by edge, and about the corner where straight edges meet in a corner between flat faces; for a **new** one the kernel makes it once at a reference size and every size after is that result scaled;
- a new extrusion or new push / pull prism (adding or cutting, not right through): made once at a reference depth and stretched along the normal about the plane it stands on; several flat faces pulled together each stretch about their own plane (`in_228`);
- angles typed for the turn axes: one turn about the middle of the body, or several about a set pivot, as one matrix (`in_228`).

**Rules that keep it honest:** the solver is asked (not guessed) where sketch corners go, and a move it would not make is left to the kernel, which refuses it as before; every case has a test that checks the moved points against the surface the kernel really makes at that size; "Share state" carries the kernel's and the frame's timings so a slow drag is measured.

**Not drawn this way (the kernel, rough mesh), and why it cannot be exact:** a corner with a curved edge (the curved faces there are not scaled about the corner); a rim between a plane and a cone (the kernel's WASM build cannot say where a cone's or torus's axis is); steps after the edit that depend on the shape being edited (a rounding of the top rim, a cut, a scale: what they make has to be worked out again); pieces of an arc cut by lines into several walls (the crossings move along the cutting lines too); a cut right through the body (the cut stops changing once it is through, so it is not a stretch); several turns about the middle of the body when no pivot is set (the middle of its box moves after the first turn).


**Which faces are the rounding (`in_323`).** The stretch of a fillet or chamfer in the picture moves the faces that are the rounding of the edge (`roundingFaces`): the strip along the edge, which lies within about its size R of the edge's line. It used to take any face within 3R, and on a small block a wall beside the rounding lies within 3R too, so when the size was dragged back from a big one (the reference stays the biggest asked for) the wall was stretched with it and the block folded into a slanted slab, in the picture only. The strip is held to 1.2 R.


**The stretch is checked against the kernel (`in_325`, `q_preview_provenance`).** The rules for which faces move are guesses that can be wrong for a shape nobody tried. So, while the pointer is down, the kernel is asked now and then (at most every 150 ms; it keeps only the newest request) for the size the picture stands at, exactly; when it answers, the stretched mesh and the kernel's are compared (the volume to a hundredth, the box to 0.05 mm: both the same however finely a curve is cut). If they differ, the stretch is not used again for that operation and the kernel's own preview is shown (a warning is written to the console, and `previewChecks` in the state snapshot counts checks and differences, and keeps the last reason). This covers a new fillet or chamfer, one pulled in or out, and a prism pull (`frame.ts` `checkStretch`); it is not made for the other stretches (a face pulled, a wall made wider, a body moved). The numbers of the stretch are in one place, `interaction/stretch.ts`, used by the picture (`ui/view/content.ts`) and by the check, so what is checked is what is drawn. A wrong picture can still show for as long as the kernel takes to answer.

## Rationale

Direct manipulation has to follow the pointer (`prin_function_over_form`, and the human asked in `in_206`, `in_215`, `in_216` for smoothness without a wireframe-only mode: "I would prefer seeing the actual object and surfaces move"). Measured on the human's own model: a rotate preview took about 130 ms per move (the kernel re-meshes the whole body), a frame of the matrix preview takes 7 ms. The transformed shapes are exact (a rigid motion, a prism stretched about its plane, a rounding of the same cross-section scaled about its sharp edge), so the picture is not an approximation that has to be corrected on release; where it would be (a cone, a curved corner, later steps that depend on the shape) the kernel is still used. Recorded here, after the code, because the code was built on the human's step-by-step approvals (`in_216` to `in_227`) without an entry behind it, against rule 9.
