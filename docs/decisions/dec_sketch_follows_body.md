---
id: dec_sketch_follows_body
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_204
date: 2026-11-07
depends_on:
  - dec_sketch_belongs_to_step: this refines it (the sketch is still the step's recipe, hidden with it; now it keeps its place with the body)
  - prin_graph_is_truth: the steps are still the source of truth; nothing is stored twice
  - dec_modifications_are_steps: a move or turn of the whole body is still a step after the extrude
---
# The sketch that made a body is carried with the body, as a continuation of the recipe

Agreed with the human after `in_201` to `in_204`: it is not that "sketches are just the body's edges" (the recipe stays the truth); it is that the sketch must not be left behind as a separate copy where the body used to be.

1. **A move or turn of the whole body carries the sketches that made it.** The same command adds the step and moves or turns every drawn part an extrude used, with its plane (`transformFigure`), so one undo takes both back. Constraints that tie a carried part to something that is not carried (a free drawing, the world, the body) are let go, as are pinned (`fixed`) corners: after a motion of one side only they could not hold.
2. **The extrude reads its sketch back through those later motions** (`compiler/graph.ts` with `operation/frames.ts`), because the step list moves the body again by itself; a step made this way is marked `follow` (older moves are not read back, so old files keep their meaning).
3. **Everything else about it was already so:** deleting the body deletes its steps and sketches and their constraints (`in_192`); the parts that made a body, and the curves its pieces were cut from, stay hidden and are not snapped to or suggested (`in_191`, `in_201`); steps that change the face the sketch made edit the sketch (`dec_face_edit_by_step`), and after a move they find it where the body is.
4. Steps that only change the body's edges (a fillet, a cut) do not change the sketch, which stays the recipe's profile. Scale and pattern steps do not carry the sketch yet.

## Rationale

The human's reading: every body started from a sketch that declared a surface; later steps move the body and change that face; the sketch should stay attached as part of the same recipe rather than split off where the body left. It removes the leaks seen (ghost constraints, lines left behind) without giving up rebuild from an early change, which edges-as-data would.
