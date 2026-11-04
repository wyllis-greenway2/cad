---
id: dec_sketch_belongs_to_step
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_047, in_048, in_049
date: 2026-11-04
depends_on:
  - prin_history_additive: the sketch is hidden and shown with its step, not rewritten, so history stays additive
  - dec_constraint_solver_small: edits to a sketch go through the solver
  - dec_stable_references: a face is named by the step that made it, and that step owns the sketch
---
# A sketch belongs to the step that consumes it

The human wants sketches to belong to the faces they produce, with no "divorced" sketches floating around (`in_047`, `in_048`). Ownership is separate from synchronization (`in_048`):

1. **Consumed.** Extruding a sketch makes the extrusion step own that profile. The loose sketch no longer shows on the plane; it is shown, and editable, with its step. Undoing the extrusion
   brings the loose sketch back. A sketch drawn on a face belongs to the step that uses it.
2. **Recipe, not current shape.** The sketch is the step's recipe (for example a circle of radius 3); the body is the result. Later modification steps change the result, not the recipe
   (`dec_modifications_are_steps`). The recipe is never shown as if it were the current geometry (the body's own edges are).
3. **Edits go through the solver.** The only time a sketch's constraints are in play is when the user deliberately edits the sketch from its step. That edit is solved with its constraints
   (`dec_constraint_solver_small`): a conflict is reported clearly and never quietly broken.
4. **Warn about overrides.** If later steps modify the faces the sketch made (a later "radius to 5" step), editing the sketch warns that those steps will override the change.
5. **Possible later command (not decided in detail):** an explicit "fold this modification into the sketch", offered only when the solver says the constraints allow it, as one undoable step the user chose.

Not built yet. Today a sketch stays on its plane after extrusion and an extrusion keeps its own copy of the shape.

## Rationale

Loose sketches that outlive their extrusion look like live geometry but are stale (the circle says 3 while the post is 5). Letting the consuming step own the sketch removes that confusion
without rewriting anything, and routing sketch edits through the solver means constraints are only ever evaluated when the user is editing the sketch on purpose.
