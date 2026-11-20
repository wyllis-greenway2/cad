---
id: dec_body_edge_pieces
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1351, in_1352, in_1358, in_1359, in_1360
date: 2026-11-20
depends_on:
  - dec_sketch_lines_and_constraints: the body's edges that lie in a sketch's plane are lines of the drawing (`in_1338`); this says what becomes of the figure of such pieces once a step is made from it
alternative_to:
---
# A figure made partly of the body's edges is copied into the sketch when its step is made

**The fault (`in_1351`, `in_1352`, `in_1358`, `in_1359`):** a drawing across a body's face is cut into pieces wherever its lines meet the body's edges; the pieces are derived from the lines and the edges **as they are now**. A step made from pieces changes those very edges, so after it the pieces could not be derived and **every later change to the model** (the radius, a depth, even the same number typed) left the step with "a part of this step is gone", with no message. Opening a saved file hid it, since a file is replayed step by step. Naming the edges by their lasting names did not help (the pieces cannot be derived from the body after the step at all).

**Chosen (`in_1360`, option A, the AI's recommendation, approved):** when the step is made, the figure's derived loops are **drawn again as lines and arcs of the sketch itself**, in the same plane (`operation/materialize.ts`; the loop's corners and the bulge of each arc, as `drawChain` draws them), and the step uses those. It no longer depends on the body's edges, and the body can change. The step does not carry `cut` or `rim` any more (those said "pieces"). The commands are one batch (the lines, then the step or steps), so one undo takes it all back. The picture while a size is set (the preview) keeps the pieces as they are (`opCommand(…, { raw: true })`); the step made for good has the copy.
**What it costs:** the copy is the figure as it was when the step was made. A later change of the body's size does not move it (a pocket cut from the pieces of a disk's top keeps its size when the disk is made larger). Following the size is option C of the question this replaces (derive the figure against the body before the step); it stays possible later, and is not done.
**Said, not silent:** a change that leaves an earlier step unable to be made is now reported ("step s_008 cannot be made any more: ...; undo takes the change back", `run` in `session.ts`); the change stays.
**Old files:** a step made before keeps pieces and `rim`; it keeps the fault of before (any later change loses it) and says so now. Not changed for them.

**Tests:** `test/bodyedgecopy.test.ts` (the human's `model_5.json`: two end pieces of a cylinder's top pulled down, then the radius larger and smaller, the depth changed and the same number typed: the step stays, no error, and material stays cut), `figurerefs.test.ts`, `pullface.test.ts` (the late kernel). **Not done:** a relation from the copy to the edge it came from; the older files' steps; a revolve, sweep or loft of such figures (only the extrude copies).

## Rationale

A step that is made from something the body can change must not depend on it. Drawing the pieces into the sketch is the smallest change that makes the figure the step's own, and it is what the human described: the edges of the model that take part in a sketch are part of the sketch.
