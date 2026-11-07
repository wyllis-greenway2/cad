---
id: q_sketches_are_body_edges
kind: question
status: open
origin: ai-unreviewed
human_input: in_201, in_202, in_203
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

## After `in_202`

The human's reply: wouldn't edges-as-data be a cleaner model, since the constraints would follow the body around and stay true or become invalid with each change; does a recipe that is separate from the body not have a sync problem; and one sketch need not make several bodies (that is what copy is for).

My answer, still not a decision:
- **Agreed:** "one sketch, several bodies" is not needed, so that objection goes; and the leaks the human saw (a ghost to snap to, lines left behind, a recipe in the old place after a move) are real signs that the recipe and the body are not presented as one thing.
- **Not a sync problem as built:** the body is derived from the recipe (`prin_graph_is_truth`, human-authored: the graph of operations is the source of truth and geometry is output, like source and binary), so there is one truth, not two copies to keep equal; what was wrong was *presentation* (recipe parts shown or snapped in the world after the body moved), which is fixed by treating them as the body's.
- **The real fork:** edges-as-truth is direct modelling (B-rep is the data, constraints are on it, each edit produces a new B-rep). That drops what the human's blueprint asks for (rebuild from an early change, the editable history for the AI, stable names by operation) and needs a solver that edits a solid from constraints on its edges, which has no general answer for a corner or an edge that reshapes its neighbours (`dec_direct_modification`). Things built because the recipe exists (face edit by step, edges found again by sigs and ranks, regions) would be rebuilt around the B-rep. It would reverse `prin_graph_is_truth`, so it is the human's call, not a refinement.
- **Middle way offered:** keep the recipe as the truth and make it behave as the body's own: a body's frame (the moves and turns of the whole body) applies to everything that built it, wherever it is shown; edges of the body can be offered every sketch tool and dimension that makes sense.

## After `in_203` (converging, not yet approved)

The human clarified: they agree it is a recipe of steps; the point is only that the sketch is not left as a separate copy where the body used to be: the later steps that change the body's place, and the ones that change the face the sketch made, should carry on acting on the sketch, so it stays attached to the body as a continuation of the recipe.

That fits the recipe model. My proposed reading, for the human to confirm: (1) the recipe stays the truth; (2) the sketch's *current* place is its recipe place carried through the later steps that move or turn the whole body (a body move or turn is a step after the extrude, so the sketch's current frame is the extrude's own frame with those steps applied), so wherever the sketch is shown, snapped to, picked or edited it is in the body's frame, and an edit made there is carried back into the recipe frame; (3) steps that change the face (a radius pulled, a side moved) already edit the sketch (`dec_face_edit_by_step`); (4) steps that change only the body's edges (a fillet, a cut) do not change the sketch, which stays the recipe's profile; (5) deleting the body deletes its sketches and constraints (built). Not built yet: (2) for sketches that are shown again; they are hidden by default so nothing shows apart today.

## Rationale

Needed to answer `in_201`. Nothing depends on it; kept open until the human chooses between keeping the recipe with the experience described here, or the literal edges-only model.
