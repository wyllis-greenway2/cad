---
id: q_revolve_body_face
kind: question
status: open
origin: ai-unreviewed
human_input: in_484
date: 2026-11-16
depends_on:
alternative_to:
---
# Revolve a face of a body, as if it were a sketch

`in_484` asks why a surface (a flat face of a body) cannot be treated as a sketch and revolved, about one of its edges or about the revolve's orb put out in space. **Today:** Revolve (`startOp`, `kind === "revolve"`) takes only *drawn* figures (`drawnFaces`): a body's face has no sketch behind it and is refused ("select a closed figure first"). Push / pull of a body face and *Sketch on face* (`dec_sketch_on_face_follows_body`) already exist, so a face is used as a plane but not as a profile. `dec_spiral_extrude` said "a closed figure (or a selected face)" in its proposal but only the figure was built.

**Can be built:** a flat face's outline is known (its triangles and edges, `faceEdit`), the revolve already has a pivot and axis frame (`revolveStart`) and an orb, and the kernel turns any planar wire. **Choices for the human:**
1. *Recommended:* the face becomes a figure at the moment of the revolve (its outline copied as a sketch on its own plane, as sketch-on-face does) and the revolve runs as it does for a drawn figure, with the same angle and advance; the axis is one of the face's edges (the nearest to the pointer; Tab goes to the next) or the orb moved out in space (a line in the face's plane through it, parallel to an edge or to a world axis). The result joins the body it came from if it touches, cuts if it overlaps (`cutOrAdd`), else a new body.
2. Only edges as the axis, no orb in space (smaller).
3. Revolving a face in place as a *face edit* (the face swept round, as push / pull moves it): more exact for repairs, but the history step is different (`dec_face_edit_by_step`).

An axis that cuts across the face (the figure would cross itself) is refused with the reason. **Awaiting the human's choice; nothing built.**

## Rationale

Production code needs an accepted entry behind it (`CLAUDE.md` rule 9); the choice changes what the step records and how the axis is picked.
