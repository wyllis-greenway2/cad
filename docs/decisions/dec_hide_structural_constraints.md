---
id: dec_hide_structural_constraints
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_238, in_239, in_240
date: 2026-11-09
depends_on:
  - dec_sketch_follows_body: the sketch of a body stays the recipe, so what is shown of its constraints is a question about the recipe
---
# Once a sketch has made a body, only the constraints that can change it are shown

The human, `in_238`, asked for a universal rule that hides the constraints that must hold for a body to be a body and keeps those that can still change its shape; `in_239` approved the rule as recommended.

**The rule (by role, not by kind).**
1. **Structural, hidden** once a step has been made from the sketch: a relation of kind coincident, onLine, onCircle or arcEnds whose parts are all members of an extruded profile (`consumedAll`) and which was made while the outline was drawn (its id number is lower than the first extrude step's; ids and step ids share one counter).
2. **Intent, always shown:** dimensions, tangent, perpendicular, parallel, horizontal, vertical, equal, and any relation with a part outside the profile (the world, another sketch, a body edge).
3. Before a step is made from the sketch everything shows. Taking the step out shows everything again.
4. A refused edit still flashes the relations that refused it, hidden or not (`annotationsOf` does not filter).
5. **Show all:** the "Constraints" row of the ⋯ list toggles `AppState.showAllConstraints`; the History sketch button shows everything too.
6. A figure cut into pieces is structural for any step's profile.

**Partner corners (`in_240`):** a trim that makes a corner where another corner of the drawing already is (not a crossing the faces derived) adds a `coincident` relation between them, so what is hidden is really there (`partnersOf` in `operation/trim.ts`, tests in `test/trimpartners.test.ts`). **Not built:** the drop-and-move test for a tangent that is the only join; partner corners of drawings made before this (nothing adds them to old files). Relations made by the human after the extrusion have a higher id number and so show, which relies on that counter.

Code: `structuralRelations` in `operation/ownership.ts`; `annotationsFor(..., all)` in `interaction/annotations.ts`; tests in `test/hidejoins.test.ts`. Line-to-arc tangents are now placed (they had no annotation before, so were never visible).

## Rationale

Constraints that cannot change without breaking the body are noise on a crowded screen; those that can are the controls of its shape. Hiding by role keeps the second kind, and the show-all switch and the flash on refusal keep the trail.
