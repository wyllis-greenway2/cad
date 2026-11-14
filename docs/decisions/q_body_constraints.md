---
id: q_body_constraints
kind: question
status: open
origin: ai-unreviewed
human_input: in_293
date: 2026-11-14
depends_on:
alternative_to:
---
# Constraints and suggestions between bodies, as there are between sketch parts

The human asked (`in_293`) for "the same constraints and suggestions on bodies that we do on sketches". Nothing is built. What is true today: relations (`relations` in the scene) are solved in 2D, one plane at a time, over drawn corners and circles; a body is moved by **steps** (move, turn, scale), not by solver variables, so a constraint between two bodies has nothing for the solver to move. My proposal, in the order I would build it:

1. **Suggestions while a body is dragged free or with an arrow** (no new constraint kind yet): when a face, edge, or centre of the dragged body comes within a few millimetres of lining up with one of another body (faces flush, edges in line, centres aligned, touching), the body snaps to it and says so (the hint icons and the part lit amber, as for a sketch point), and a release keeps it as an ordinary move. This is the part of "suggestions" that has no constraint behind it and needs no new machinery beyond the free drag.
2. **Constraints that stay true afterwards** (flush faces, a distance between two faces, centres aligned, touching): each would be a relation between two body parts, kept true by **a move step that is recomputed** when something it depends on changes (a solver over the bodies' positions, 3D, separate from the sketch solver). That is a new subsystem: it needs a decision (what is solved, in what order, what happens when two constraints disagree) before any code.
3. **Fixed in place** for a body (it refuses to be dragged or moved), which is small.

Questions for the human: is (1) enough for now, with (2) kept for later? Which relations first: flush faces, a distance between faces, centres aligned?

## Rationale

The sketch constraints work because the sketch solver owns the positions; bodies do not have that. Saying so, and splitting the request into what needs no new subsystem and what does, is what the human needs to decide; nothing depends on this entry.
