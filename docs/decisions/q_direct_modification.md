---
id: q_direct_modification
kind: question
status: open
origin: ai-unreviewed
human_input: in_038
date: 2026-11-04
---
# Is pushing a face "extrude", or direct modification of the body?

The human asked whether pulling a face is really an extrusion or "body modification", and suggested that selecting a curved surface could
change its radius, a face could be dragged in or out or rotated, and that "sketch from surface" (turning a suitable surface into a normal sketch,
then extruding as usual) is the clearer way to think about extrusion (`in_038`).

What `prototypes/cad-ui` does now (AI's reading, not yet approved): **Extrude** is only sketch shape to body. **Sketch from surface** (S) turns a
plane, a flat face or an unextruded shape into a sketch. **Modify** is a family acting on a selection: push/pull a flat face (built, as a face feature that
is found again by position), move / rotate / scale a whole body (built), and, not built, change the radius of a curved face, rotate a face, fillet or
chamfer a selected line, move a line or corner.

Open: should direct modifications be recorded as steps in the history like extrusions (replayable, but they fail when earlier steps move the face they
point at, see `q_topological_refs`), or edit the earlier step's own parameters (for a radius, the sketch circle that made it)? Editing the originating
parameter is more parametric but is not always possible (a face made by a boolean has no single parameter).

Not decided. The human has not chosen.
