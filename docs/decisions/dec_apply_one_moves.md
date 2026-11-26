---
id: dec_apply_one_moves
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1640
date: 2026-11-26
depends_on:
  - dec_marks_on_things: the preview arrows are the apply itself, so a change to what moves when applying is what the arrows show
alternative_to:
---
# Applying a constraint moves one thing to the other

When a constraint is applied from an offer, one thing moves to the other and the other stays (`in_1639`, `in_1640`). **A pair that was picked:** the first picked moves to the second. **A near offer** (a part selected, offered with another part): what is selected, with what it is made of, moves to the part it is matched with. The part that stays is held in the solve (`hold`); if holding it makes the sketch impossible (it is fixed, or other constraints say where it goes) it is let go and the solve is as before, so nothing else is refused that was not already. The arrows of an offer are the same solve (`planOf`, `sketchmarks.ts`).

**Approved by the human:** the rule for a picked pair (first moves to second). **Mine, not yet reviewed:** a circle that goes to a point or a line by its edge (on the circle, tangent) keeps its centre and changes its size, as a drag of its edge does; and for a near offer, the selected part is the one that moves.

## Rationale

The human's reading of the system is "one thing moves to another thing, not both" (`in_1639`). Before this, the solver took the smallest total change and a free circle size took a share of every move, so "vertex on the circle" moved the vertex and grew the circle.
