---
id: dec_constraint_ownership
kind: decision
status: accepted
origin: human
human_input: in_085
date: 2026-11-05
depends_on:
  - dec_no_sketch_isolation: constraints will cross from a sketch to the body, so who owns and who uses each one has to be known
---
# Map who owns and who uses each constraint

The human (`in_085`): breaking a constraint by deleting what it refers to is not a new problem (it already happens inside one sketch), so "we need to map constraint ownership and have some sort of way to see them when something is clicked on, we can work the UI out later for that."

What is built (`src/constraintmap.mjs`, pure, tested in `test/constraintmap.test.mjs`):
- a constraint is **owned** by one sketch (the one whose solve it takes part in) and **uses** named parts: corners, lines, radii, centres;
- the map answers: which constraints touch this part or shape (and what else each ties it to), which constraints would a deletion take with it, and which constraints point at something that is gone (broken);
- **deleting a shape now removes the constraints that used it** (it used to leave them dangling) and undo brings them back together; a note says how many went with it;
- `session.constraintsOnPicks()` returns the constraints touching what is picked, ready for a UI (the selection pill already shows icons for them; richer display comes later).

Later (with stage 2 of `dec_no_sketch_isolation`): a part of the body is addressed the same way (`key` plus a stable name), so a constraint from a sketch to a body corner shows up on both ends, and a broken one is listed and can be repaired or removed.

## Rationale

Constraints that point at missing parts silently stop doing anything and confuse the solver and the person. Knowing the owner and the users of every constraint is the base for showing them, for deleting safely, and for the cross-sketch constraints to come.
