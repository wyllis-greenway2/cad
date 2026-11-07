---
id: q_sketches_are_body_edges
kind: question
status: open
origin: ai-unreviewed
human_input: in_201
date: 2026-11-07
depends_on:
  - dec_sketch_belongs_to_step: the proposal would change point 2 of it (the sketch is a hidden recipe, the body is the result)
  - dec_modifications_are_steps: a body move is a step after the extrude, not a change to the sketch
---
# Should sketches simply be the edges of the body ("there are no sketches, only edges and surfaces")?

The human's proposal (`in_201`): no separation between sketches and edges; once extruded, a sketch's edges belong to the body, and move, rotate, are deleted and are constrained with it: delete the body and every "sketch" and constraint of it goes (no ghosts); move or rotate the body and its edges and constraints move with it, because they *are* the body.

My reading and recommendation (not decided):

- **What the human sees, we should have: yes.** Delete takes the sketches and their constraints with the body (built, `in_192`); nothing of a body's sketch should be left showing or move apart from it (a bug fixed in `in_201`: arcs and lines that pieces of the extruded shape were cut from were left visible); hidden sketches are not snapped to or suggested (built, `in_191`); editing the body's edges edits the thing that made them (face edit by step, `dec_face_edit_by_step`); and body edges can already be used like sketch lines for offset (`in_199`).
- **As a literal data model, I advise against.** Today the sketch is a *recipe* kept hidden with the step that made the body (`dec_sketch_belongs_to_step`); the body is the result. If the sketch were just the body's edges: (1) a fillet, chamfer, cut or a second extrude changes the edges, so a sketch line stops being an edge of the body and the part that made it would have to be kept somewhere anyway; (2) changing an early dimension would no longer rebuild what came after, which is what lets pulling a face or changing a radius edit the right step and keep the fillets; (3) one sketch can make more than one body, or one body from several sketches, so "belongs to" is many to many; (4) constraints between sketch lines and between body edges mean different things (a body edge cannot be moved on its own). What the proposal wants is the *experience*, which we can have with the recipe kept: parts that built a body ride with it (they are hidden and in the body's own frame, so they need no moving), and body edges are offered the sketch tools that make sense (offset done, trim and dimension next).
- **If the human prefers the literal model anyway**, the cost is large (history would be given up or rebuilt around edges) and it would replace `dec_sketch_belongs_to_step` and `dec_modifications_are_steps`.

## Rationale

Needed to answer `in_201`. Nothing depends on it; kept open until the human chooses between keeping the recipe with the experience described here, or the literal edges-only model.
