---
id: dec_revolve_body_face
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_484, in_485, in_486
date: 2026-11-16
depends_on:
  - dec_sketch_on_face_follows_body: the copy is a sketch on a drawn plane that goes with the body, as a sketch drawn on a face is
  - dec_spiral_extrude: the revolve itself (angle, advance, the orb as the axis) is that decision's, unchanged
alternative_to:
---
# Revolve a face of a body: the face becomes a figure at the moment of the revolve

`in_484` asks why a surface (a flat face of a body) cannot be treated as a sketch and revolved, about one of its edges or about the revolve's orb put out in space. **Today:** Revolve (`startOp`, `kind === "revolve"`) takes only *drawn* figures (`drawnFaces`): a body's face has no sketch behind it and is refused ("select a closed figure first"). Push / pull of a body face and *Sketch on face* (`dec_sketch_on_face_follows_body`) already exist, so a face is used as a plane but not as a profile. `dec_spiral_extrude` said "a closed figure (or a selected face)" in its proposal but only the figure was built.

**Can be built:** a flat face's outline is known (its triangles and edges, `faceEdit`), the revolve already has a pivot and axis frame (`revolveStart`) and an orb, and the kernel turns any planar wire. **Choices for the human:**
1. *Recommended:* the face becomes a figure at the moment of the revolve (its outline copied as a sketch on its own plane, as sketch-on-face does) and the revolve runs as it does for a drawn figure, with the same angle and advance; the axis is one of the face's edges (the nearest to the pointer; Tab goes to the next) or the orb moved out in space (a line in the face's plane through it, parallel to an edge or to a world axis). The result joins the body it came from if it touches, cuts if it overlaps (`cutOrAdd`), else a new body.
2. Only edges as the axis, no orb in space (smaller).
3. Revolving a face in place as a *face edit* (the face swept round, as push / pull moves it): more exact for repairs, but the history step is different (`dec_face_edit_by_step`).

An axis that cuts across the face (the figure would cross itself) is refused with the reason. **Approved: option 1 (`in_485`).**

**Built (`in_485`):** beginning Revolve with one flat face of a body selected first draws the face's outline exactly (every loop: the outer one and the holes; lines and arcs) as a sketch on a drawn plane that goes with the body (`faceSketchCommand` in `offsetbody.ts`, the offset's own outline code with no offset), selects that figure, and goes on as for a drawn figure: the axis is the longest edge to start, another edge, a point or a face clicked, or the orb moved out in space (all as before); the angle, the advance, and the join / cut / new body are the revolve's own. The copy is a drawing, not a step, and stays if the revolve is cancelled (undo takes it away). A face that is round, or whose edges are not lines and arcs, is refused with the reason. **Changed (`in_486`):** an axis that lies in the figure's plane and has parts of the figure on both sides is refused when the revolve is made (`axisAcross` in `revolve.ts`, called from `runOp`), with the reason and nothing made; for any figure, drawn or a face's copy. An axis on an edge, beside the figure, across the plane (a twist) or off the plane is not judged here (the kernel's own refusals stand). **Not built:** revolve in place as a face edit (option 3); the live picture while the orb is dragged across the figure is not refused, only the step.

## Rationale

Production code needs an accepted entry behind it (`CLAUDE.md` rule 9); the choice changes what the step records and how the axis is picked.
