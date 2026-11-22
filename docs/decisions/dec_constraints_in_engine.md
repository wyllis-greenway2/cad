---
id: dec_constraints_in_engine
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1506, in_1507
date: 2026-11-22
depends_on:
  - dec_constraint_solver_small: the solver is the small pure one of our own with a fixed interface; this entry puts it inside the engine's steps and makes it the only thing that decides a sketch
  - inv_constraint_uniformity: one verdict channel for every refused change is that rule written as an interface; a change to the rule changes what the verdict must carry
  - dec_hints_place_only: a snap or hint places a point and makes no constraint; the interaction layer is built on that
  - dec_anchor_geometry: a body's edges are read-only fixed parts for a sketch; this entry keeps that and names them by lineage, not by position
---
# Sketch constraints: the solver and the references are in the engine; snapping and suggestions are a layer on top that only reads

The human asked whether sketch constraints are part of the engine or a system of their own, and agreed (`in_1507`) with this answer, drafted from the old project's records (`in_1506`):

1. **In the engine:** the sketch is an input of a step (E3). The step's constraints are solved by a **pure, deterministic solver** that is part of the step's computation, so edits, cutoff and replay hold (E18, E20). It returns the solved sketch **and one verdict**: solved, under-constrained, over-constrained or redundant, with the constraints named. Constraints name geometry by **id** (E6), resolved through lineage; a reference that cannot be found makes the step orphaned, in words (E10).
2. **Not in the engine:** snapping, the dashed suggestions, the orange alignment, the red flash, the display of constraints for the selection. That is **a layer that only reads** engine data (one reference set of the holdable parts of a sketch plane, one `hold` function) and decides nothing about geometry. A snap or a hint only places; a constraint is made only when asked for (`dec_hints_place_only`).
3. **A body's edges are read-only anchors in the sketch's one list of lines** (E5, `dec_anchor_geometry`): selectable, snappable and constrainable like any line, **fixed for the solver, never moved by a constraint** (they change by editing the step that made them). A line committed on a face becomes a body edge (E4), so the two are one kind of object. Edges and things **off the plane** are held through a read-only projection into the plane; relations that mean nothing on the projection are refused with the reason.
4. **Constraints between bodies** (placement) use the **same relation vocabulary and the same verdict**, with a separate solver for poses (6 unknowns a body). Not built now.

The rows are E48 to E61 of `docs/rebuild/engine_requirements.md`.

## Rationale

The old project's constraint trouble came from state and decisions spread over places (six places each deciding what is under the pointer; refusals written by hand in many paths; two solvers that disagreed; edges named by position). Putting the solve and the references in the engine makes them one thing with ids and one verdict; keeping the interaction layer outside lets it be rebuilt without touching the geometry (`q_unified_snapping`, `q_constraint_audit`). The split is the human's agreement, not a measurement.
