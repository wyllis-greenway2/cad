---
id: dec_relations_standard
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_089, in_090
date: 2026-11-05
depends_on:
  - dec_no_sketch_isolation: any part can be selected with any other, so every pair needs a defined relation
  - dec_constraint_ownership: relations are owned by one place and name the parts they use
---
# One table of relations for every pair of parts, measure then lock, and a plane chosen by a fixed rule

The human (`in_089`) wants the relations between any two parts to be obvious and to work the same everywhere: a distance between any two corners or any two parallel lines, an angle between any two lines, and a clear answer to which plane a relation lives in.

**Parts** (what can be selected): a corner, a line (a segment of a sketch or an edge of the body), a circle (centre and radius), a plane or flat face, a world axis or world plane (as reference parts), a whole body.

**One rule for every relation.** Select one or two parts: the menu lists every relation that is defined for exactly that pair, in the same order and with the same name and icon everywhere; the ones that do not apply are greyed with the reason. Which part moves depends on the order of selection (first moves, second is the reference); what the relation means does not. Relations are of two kinds:
- **Geometric** (no number): coincident, on (a corner on a line, on a circle, on a plane), collinear, parallel, perpendicular, coplanar, horizontal, vertical (these two are just "parallel to a world axis"), equal (length, radius), midpoint, tangent, concentric, fixed.
- **Dimensional** (a number): distance, angle, length, radius. These always work as **measure, then lock**: selecting the parts shows the current value as a chip; typing a number locks it (a driving dimension, shown with a lock); unlocking leaves it as a reference measurement. Same for every pair.

**The table** (relation by the pair of parts):

| Pair | Geometric | Dimensional |
|---|---|---|
| corner, corner | coincident, horizontal / vertical alignment | distance (straight), and the part of it along an axis (dX, dY, dZ) |
| corner, line | on the line, midpoint | distance (perpendicular to the line's infinite carrier; optionally to the segment) |
| corner, plane | on the plane | distance |
| line, line | parallel, perpendicular, collinear, equal length | angle, and distance when they are parallel (the perpendicular gap between their carriers; otherwise the shortest distance) |
| line, plane | parallel, perpendicular, lies in | angle, and distance when parallel |
| plane, plane | parallel, perpendicular, coplanar | angle, and distance when parallel (an offset) |
| circle, circle | equal radius, concentric, tangent | distance between centres |
| circle, line | tangent | distance from the centre |
| one corner | fixed | position (x, y, z) |
| one line | horizontal, vertical, fixed | length, angle to a world axis |
| one circle | | radius or diameter |

**Which plane a relation lives in.** Distances between corners, and angles between line directions, are defined in 3D and need no plane to be measured: the chip shows the true 3D value. A plane is needed only to *solve* a relation, because the solver is 2D per sketch. The rule, in order:
1. The relation is solved in the plane of the sketch whose parts it moves (body parts and earlier steps are references that never move). A body part that is not in that plane is used as it appears projected onto it, which is exactly how the pin and the parallel relation to a body line work today.
2. If all the parts lie in one plane, that is the plane.
3. **The first part selected is the mover and the second is the reference** (the human's rule, `in_090`: "as a general rule, the first selected thing, is the mover, and the second selected thing is the reference"). The plane is the mover's plane, and the chip says so with a plane badge ("on XY"). A part that cannot move (a body part, an earlier step) is always a reference, whatever the order; if both can move, the first moves. Built so far for two parts of one sketch: the second part is held where it is while the first moves (including the angle: the first line turns, the second stays).
4. The chip always says what it measures. If the plane differs from where the parts really are (an angle between a line and a line that is tilted to the plane), the chip shows the projected value with the plane badge, and a 3D value is offered once the solver can do it.

**How it is built** (proposed order):
1. `src/relations.mjs`: the table above as pure data and functions (which relations exist for which pair, how each is measured, how each becomes a constraint), tested over the whole matrix.
2. **Body parts become fixed virtual parts inside the sketch's solve** (a corner or a line as it appears projected on the plane, at fixed coordinates). Then every existing and new constraint type works against them unchanged, and the pin (`anchor`) and the parallel to a body line (`extDir`) become ordinary constraints that name a virtual part.
3. The measure-then-lock chip for every pair, and the missing solver types (corner to line distance, parallel lines distance, on line, collinear, midpoint, tangent, concentric).
4. Later: a 3D solver, so relations between parts on different planes need no choice of plane.

The rule for which part moves is decided (`in_090`); the rest of this entry is still the AI's proposal, awaiting approval.

## Rationale

A single table makes the interface predictable: the same pair of selections always offers the same relations in the same way, and there is one place to add a relation. Treating body parts as fixed virtual parts of the sketch reuses the 2D solver we have and is what the two body relations already do. Measuring first, then locking, matches the length and angle chips that exist today.
