---
id: q_body_constraints
kind: question
status: open
origin: ai-unreviewed
human_input: in_293, in_305
date: 2026-11-14
depends_on:
alternative_to:
---
# Constraints and suggestions between bodies, as there are between sketch parts

## What the human asked next (`in_305`, model kept as `app/test/fixtures/circle-on-body-face-in_305.cad.json`) and my answer, still a proposal

**Two different things were being called "body constraints".**
- **A sketch part tied to the geometry of a body** (the human's example: a circle drawn on the top face, concentric with the body's curved edge). The unknowns are still the drawn circle's own numbers; the body's edge is **read-only**, a reference, as "project / include geometry" is in other modelers. This is the part to do first and it needs no new solver, only that the solver and the suggestions can *see* the body's edges, corners and arcs as fixed geometry. Today they cannot: a body's curved edge is a `line` with a `mid` and no centre part, relations and `nearItems` / `pointHint` / `lineHint` / `circleRadiusHint` only look at drawn parts (checked in the human's file: the circle on the top face is offered only Diameter and Delete, and no suggestions).
- **A body tied to another body** (flush faces, a distance, centres lined up). Here the unknowns are a body's **placement** (3 moves, 3 turns; a body never deforms) and the thing that moves is a step, so it needs a 3D placement solver and a decision about how the answer is stored (a "place" step that is recomputed). That is the second, larger tier.

**The difference from a sketch constraint, in a line:** a sketch constraint is between 2D parts the solver may move (inputs of the history); a constraint to a body is to a part the kernel produced (an output), so it can only be *held to*, never moved, unless it is a placement of the whole body.

**One system for all** (the proposal): every part has a *role* for a solve, whatever it belongs to: **free** (the solver may move it: the drawn parts of the sketch being solved), **anchor** (fixed, read: body corners, edges and arcs on or projected onto the sketch's plane, other sketches' parts, the world axes), and later **placed** (a body's position). A relation names parts by `Ref` and does not care which kind owns them; the solver takes anchors as fixed points and circles (it already has `fixed`), and the suggestion code runs one proximity rule (`in_294`) over *all* geometry on the plane, with anchors lit amber like anything else. The edge named in a relation must be **stable**: a body edge named by position breaks when the body changes, so an edge that comes from a sketch (the arc of a circle that was extruded) is named by that source (`edgesource.ts` already knows it; the human's circle would be concentric with the source circle's arc) and only an edge with no source (a chamfer's) is named by where it is, and is repaired or reported broken. Rule that avoids cycles: a relation may only name things **earlier in the history** than the sketch it is in.

Order I would build it, if the human agrees: (A) anchors in the solver and the selection's Constraints list for edges that come from a sketch; (B) the same anchors in the suggestions and the drawing hints; (C) edges with no source; (D) body-to-body placement (below).

The human asked (`in_293`) for "the same constraints and suggestions on bodies that we do on sketches". Nothing is built. What is true today: relations (`relations` in the scene) are solved in 2D, one plane at a time, over drawn corners and circles; a body is moved by **steps** (move, turn, scale), not by solver variables, so a constraint between two bodies has nothing for the solver to move. My proposal, in the order I would build it:

1. **Suggestions while a body is dragged free or with an arrow** (no new constraint kind yet): when a face, edge, or centre of the dragged body comes within a few millimetres of lining up with one of another body (faces flush, edges in line, centres aligned, touching), the body snaps to it and says so (the hint icons and the part lit amber, as for a sketch point), and a release keeps it as an ordinary move. This is the part of "suggestions" that has no constraint behind it and needs no new machinery beyond the free drag.
2. **Constraints that stay true afterwards** (flush faces, a distance between two faces, centres aligned, touching): each would be a relation between two body parts, kept true by **a move step that is recomputed** when something it depends on changes (a solver over the bodies' positions, 3D, separate from the sketch solver). That is a new subsystem: it needs a decision (what is solved, in what order, what happens when two constraints disagree) before any code.
3. **Fixed in place** for a body (it refuses to be dragged or moved), which is small.

Questions for the human: is (1) enough for now, with (2) kept for later? Which relations first: flush faces, a distance between faces, centres aligned?

## Rationale

The sketch constraints work because the sketch solver owns the positions; bodies do not have that. Saying so, and splitting the request into what needs no new subsystem and what does, is what the human needs to decide; nothing depends on this entry.
