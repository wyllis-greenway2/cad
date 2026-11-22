---
id: dec_body_placement
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1520, in_1521, in_1522, in_1523, in_1507, in_1506
date: 2026-11-22
depends_on:
  - dec_independent_bodies: the bodies that are placed are the named bodies of one model; a placement moves a body and changes no face id
  - inv_constraint_uniformity: a placement uses the same relation vocabulary, the same verdict and the same refusal channel as a sketch's constraints
  - dec_body_mates: the old app's mates (flush with a gap, coaxial with an offset, parallel, perpendicular, angle, axis to face) are the vocabulary to carry; this asks how they are kept
alternative_to:
---
# Placement constraints between bodies are one `place` step that solves the poses (E60)

**Decided (`in_1523`, "Go with A"):** option A below. A `place` step takes the bodies and the mates, solves each moving body's pose every recompute with the sketch solver's machinery, and moves the bodies; the history shows one step; a mated body is moved by changing a mate's number. B (the old move-and-turn steps) and C (both) are not built. The text after this paragraph is the question as it was put, kept for the reasons.

`in_1514` listed placement constraints and mates between bodies as the last group. The old app made a mate as **ordinary move and turn steps** (placed once), and a *standing* mate appended corrective steps after every change (`dec_body_mates`, `dec_standing_mates`, provisional). The rebuild's engine is a recipe of pure steps with a verdict and a refusal channel, so there is a second way. **For the human to decide before anything is built.**

**The solver is shared, not separate (`in_1521`, correcting E60's "separate solver").** What a sketch's solver already is — residual rows over forward-mode differentiation, damped Levenberg-Marquardt from where things are, the verdict (solved, under, redundant, over), the freedom count, conflicts found by QuickXplain, pins and holds for a drag, `tryAdd`, the refusal channel — has nothing in it that is two-dimensional except the *parts* (points, lines, circles with x and y) and the *unknowns* (their coordinates). For bodies the unknowns are each body's pose (a move and a turn, the turn kept as a small rotation added to where the body is now, so it stays well behaved) and the parts are 3D (a face's plane: a point and a normal; a round face's axis: a point and a direction), carried by the pose. Each relation is written once as residuals over those parts: flush is the normals opposite and the planes a gap apart, coaxial the axes parallel and a distance apart, and so on; the same names, the same table. This is also the 3D constraint `in_1506` asked for, and a sketch is the case with two coordinates and no turn out of the plane. So the work is a generalisation of `solver.ts` (parts and unknowns come from a small interface), not a second solver. The choice below is separate from this: it is about whether a placement is a step that is solved or steps that are made.

**A. A `place` step that solves the poses (my recommendation).** One step, `place`, takes the bodies and a list of mates (each names two faces by their ids, E6, and has a number where it has one). Every recompute it solves the pose of each free body (six unknowns: three of move, three of turn) with the same solver (generalised as above) and moves the bodies; no face id changes. A conflict is **refused and named, never ranked** (`in_330`, `in_331`): the mates that cannot hold together, found as the sketch's conflicts are (QuickXplain). A body the mates leave free says how (a hinge turns, a slider slides: the freedom count and the free directions, as a sketch's verdict does). A joint's own position (the angle of a hinge, the slide of a slider) and its stops are numbers of the mate, so a drive is an edit of a number, not a new step. History stays additive and replays exactly; undo is the history's undo; nothing is appended behind the person's back.
- *Cost:* the old app's way of moving a body by hand and having its mates corrected by new steps goes away: a body in a mate is moved by changing the mate's number (an offset, an angle, a gap) or by taking the mate away; a body in no mate moves with `move` and `turn` as now. The history shows one `place` step, not a series of moves. A mate that names a face that is gone orphans the step, in words (E10), as any reference does.

**B. Keep the old way.** A mate makes `move` and `turn` steps once; a standing mate appends corrections after the change that broke it, in the same history entry. Nothing new in the engine; the corrections are greedy (the old app added a pose solve later for competing mates, `in_329`), the history grows with every correction, and a conflict can only be found after the steps are made.

**C. Both:** `place` for standing mates, and "place once" as a button that makes the steps A would have solved.

**What I would carry from the old app into the first slice of A:** flush (a gap), coaxial (an offset), parallel and perpendicular faces and axes, an angle (0 to 180), axis perpendicular to a face; the first body named moves and the other is the reference, as before; a body can be marked fixed. **What I would leave out of the first slice:** collision and contact (the old `contact.ts`), gear ratios and motion playing, limits and drive handles (they are numbers of the mate and come after the mates themselves), several joints chained into a mechanism's motion.

## Rationale

The recipe is the model and a step is pure (E20): the same bodies and mates must give the same poses on every machine. A pose solve inside one step satisfies that and gives what appended corrections cannot (the verdict before anything is made, the freedom count, a conflict named). The price is that the history no longer shows each move. Whether that price is acceptable is the human's: it changes how an assembly is edited. I did not build anything: this is the one group whose shape depends on that choice.
