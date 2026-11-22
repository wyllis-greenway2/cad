---
id: q_body_placement
kind: question
status: open
origin: ai-unreviewed
human_input: in_1520, in_1507, in_1506
date: 2026-11-22
depends_on:
  - dec_independent_bodies: the bodies that are placed are the named bodies of one model; a placement moves a body and changes no face id
  - inv_constraint_uniformity: a placement uses the same relation vocabulary, the same verdict and the same refusal channel as a sketch's constraints
  - dec_body_mates: the old app's mates (flush with a gap, coaxial with an offset, parallel, perpendicular, angle, axis to face) are the vocabulary to carry; this asks how they are kept
alternative_to:
---
# How do placement constraints between bodies work in the rebuild (E60)

`in_1514` listed placement constraints and mates between bodies as the last group. The old app made a mate as **ordinary move and turn steps** (placed once), and a *standing* mate appended corrective steps after every change (`dec_body_mates`, `dec_standing_mates`, provisional). The rebuild's engine is a recipe of pure steps with a verdict and a refusal channel, so there is a second way. **For the human to decide before anything is built.**

**A. A `place` step that solves the poses (my recommendation).** One step, `place`, takes the bodies and a list of mates (each names two faces by their ids, E6, and has a number where it has one). Every recompute it solves the pose of each free body (six unknowns: three of move, three of turn) with the solver's own machinery (residuals over forward-mode differentiation, damped Levenberg-Marquardt from where the body is now, so it moves as little as it can) and moves the bodies; no face id changes. A conflict is **refused and named, never ranked** (`in_330`, `in_331`): the mates that cannot hold together, found as the sketch's conflicts are (QuickXplain). A body the mates leave free says how (a hinge turns, a slider slides: the freedom count and the free directions, as a sketch's verdict does). A joint's own position (the angle of a hinge, the slide of a slider) and its stops are numbers of the mate, so a drive is an edit of a number, not a new step. History stays additive and replays exactly; undo is the history's undo; nothing is appended behind the person's back.
- *Cost:* the old app's way of moving a body by hand and having its mates corrected by new steps goes away: a body in a mate is moved by changing the mate's number (an offset, an angle, a gap) or by taking the mate away; a body in no mate moves with `move` and `turn` as now. The history shows one `place` step, not a series of moves. A mate that names a face that is gone orphans the step, in words (E10), as any reference does.

**B. Keep the old way.** A mate makes `move` and `turn` steps once; a standing mate appends corrections after the change that broke it, in the same history entry. Nothing new in the engine; the corrections are greedy (the old app added a pose solve later for competing mates, `in_329`), the history grows with every correction, and a conflict can only be found after the steps are made.

**C. Both:** `place` for standing mates, and "place once" as a button that makes the steps A would have solved.

**What I would carry from the old app into the first slice of A:** flush (a gap), coaxial (an offset), parallel and perpendicular faces and axes, an angle (0 to 180), axis perpendicular to a face; the first body named moves and the other is the reference, as before; a body can be marked fixed. **What I would leave out of the first slice:** collision and contact (the old `contact.ts`), gear ratios and motion playing, limits and drive handles (they are numbers of the mate and come after the mates themselves), several joints chained into a mechanism's motion.

## Rationale

The recipe is the model and a step is pure (E20): the same bodies and mates must give the same poses on every machine. A pose solve inside one step satisfies that and gives what appended corrections cannot (the verdict before anything is made, the freedom count, a conflict named). The price is that the history no longer shows each move. Whether that price is acceptable is the human's: it changes how an assembly is edited. I did not build anything: this is the one group whose shape depends on that choice.
