---
id: q_hide_structural_constraints
kind: question
status: open
origin: ai-unreviewed
human_input: in_238
date: 2026-11-09
depends_on:
  - dec_sketch_follows_body: the sketch of a body stays the recipe, so what is shown of its constraints is a question about the recipe
---
# Once a sketch has made a body, show only the constraints that can still be changed

The human, `in_238`: a body's straight edges say they are coincident and on line with the circles' edges; "if this werent true, then it wouldn't be a valid body at all". Is there a universal rule to hide the constraints that must hold and keep the ones that can still change the body in true ways?

What the example holds (`three-circles`, extruded): 21 relations, of which 15 only join the pieces of the outline (3 arcEnds, 6 onLine, 6 onCircle) and 6 are tangents. No dimensions.

Recommendation (not decided): **yes, with the rule stated as the role, not the kind**:
1. **Structural (hidden once a step has been made from the sketch):** a relation whose parts are all members of the same extruded profile (its lines, arcs, circles and corners) and which joins them: coincident, onLine / onCircle of a profile corner on a profile member, arcEnds. They are what makes the outline an outline.
2. **Intent (always shown, and editable):** dimensions (length, distance, diameter, radius, angle), tangent, perpendicular, parallel, horizontal, vertical, equal. Taking one away, or changing its number, still leaves a valid outline, only another one. In the example only the six tangents would show.
3. **Anything that ties the profile to something outside it** (the world, another sketch, a body edge, a corner of another figure) is intent whatever its kind (an onLine to a world axis, a coincident with the origin).
4. Before a step is made from it (a sketch, a flat figure, an open one) everything shows, as now. Taking the step out of the history shows everything again.

Edge cases, and what keeps them from biting:
- **Hidden is not gone.** A hidden relation still holds, so a refused edit ("the constraints would put it back") must still flash its culprits, hidden or not, and say so; a "show all constraints" switch (and the History sketch button) shows them.
- **Partner corners.** Two corners of the outline that sit on the same spot with no relation between them (an arc end and a line end, left by trimming) are joined only by where they are; a solve can pull them a hair apart (this was the cause of `in_231`'s "select lines to extrude"). Such a pair should get a coincident relation when the outline is made or trimmed, so the rule hides something that is really there.
- **Joins added later by the human** between two profile corners (a deliberate coincident) look structural by kind; they should show, since the human put them there: the rule applies to relations made while drawing the outline, not to ones added to the extruded sketch afterwards.
- **A figure cut into pieces** (pieces share sides; one step may use one piece) is part of two profiles at once: a relation is structural if it is for any step's profile.
- **Tangent that is also structural:** where the outline would otherwise be invalid without tangency (a fillet drawn as an arc between two lines whose ends are on it only by the tangent), the tangent is the join. Checked mechanically: drop the relation, move one neighbour, see if the profile stays closed; if not it is structural.
- **Selection hints:** the suggestions (the constraints that could go on a selection) already leave out those that hold; they do not change.

## Rationale

Part of keeping the screen clear (`in_238`): constraints that cannot be changed without breaking the body are noise, those that can are the controls of the body's shape. The rule keeps the second kind and hides the first without losing the trail.
