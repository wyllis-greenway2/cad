---
id: dec_exact_rim_numbers
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1386, in_1384, in_1383, in_1382, in_1381, in_1372
date: 2026-11-21
depends_on:
  - dec_anchor_geometry: the reference is the anchor relation it decided (a corner on a body's circular edge); this entry changes what numbers the anchor resolves to, not the relation
  - inv_kernel_boundary: the exact numbers cross the boundary as plain data in the result, never as kernel objects
alternative_to:
---
# A point held to a body's curve is held to the curve's exact numbers, and reaches the kernel unrounded

**Approved to build (`in_1384`).** The faces of a cut that would not mesh (`in_1368` on, model_6) come from a corner meant to lie on a body's curved edge lying a hair inside it. Found (`in_1369` to `in_1382`; `prototypes/rim-corner-precision`):
- The reference already exists: a snap gives `onCircle(corner, edge)` and the drawing keeps it (`hints.ts`, `dec_anchor_geometry`).
- It is resolved against a rounded copy: the anchor's centre and radius come from the kernel's description rounded to a ten-thousandth (`r4`, `evaluate.mjs`); the cylinder of `cylinder-pockets.cad.json` has the anchor radius 12.5 and a real rim of 12.500019.
- And the send rounds again: the sketch's points go to the kernel rounded to a millionth (`r6`, `to2d` in `graph.ts`). On a plain cylinder, corners exactly on the rim meshed 40 of 40 at full precision and 16 to 20 of 40 rounded to a millionth; from about 5e-7 mm inside they fail every time; 1e-9 inside or outside meshes.

**Proposal (three parts, each checked by tests before the next).**
1. **The kernel's description carries the exact numbers** of a body's circular edge (centre, radius, arc ends) beside the rounded ones, as extra plain data. The rounded ones stay what names an edge (`e@...`, `c@...`): the names are the reason a finer number everywhere broke the naming of sides in five tests (`in_1372`).
2. **The anchor reads the exact numbers** (`anchorRounds`, `roundsOf`, the solver's fixed virtual part), so a corner held on the rim is on the real rim.
3. **A point that has such a relation is sent to the kernel unrounded** (`to2d` and the figure's `sides`): only those points; every other point keeps its millionth.

**Built (`in_1384`).** (1) `evaluate.mjs` gives `circle.exact` (centre, radius, unrounded) on a circular edge and `exact` on a round face along a world axis; `KernelEdge.circle` (`adapter.ts`), `Line.circle` and `Curved` (`part.ts`) carry it; the names still use the rounded numbers. (2) `roundOf` (`part.ts`), the one reader of an anchor's circle, returns the exact numbers when they are there. (3) `graph.ts`: the corners of a figure that an `onCircle` or `onLine` relation holds on a part of a body (`heldToBody`) go to the kernel to a trillionth (`r12`), every other point to a millionth as before. A round face that is not along a world axis and a straight edge's anchor have no exact numbers yet (b above). Test: `cutmeshes.test.ts`, eight cuts of corners held on the rim of cylinders of radius 12.5, 12.500019, 12.34567 and 7.123457 at different angles: 3 of 8 left a face undrawn before, none now.

**Found when run by hand (`in_1386`); built as proposed (`in_1387`, see "Built the geometric test" below).** Snapping three clicks to a cylinder's rim in the browser puts the corners exactly on the circle (12.5000000 from the axis) but stores **no relation**: a snap only places the point and a constraint is made when asked for (`settings.sketch.hintConstraints` is false, `in_1329`). So part 3 (the send) does nothing for an ordinary snap; it applies only to a corner that has been given the relation. Measured through the app's own path, corners exactly on the rim with no relation, 40 angle sets: 1 of 40 cuts still left a face undrawn after the retry (the retry mends most; the prototype's rounding alone failed 16 to 24 of 40). Proposed instead of the relation as the test: a corner of a figure that lies within a ten-thousandth of a mm of a circle of a body in the sketch's plane (`anchorRounds`) is put on that circle exactly and sent to a trillionth. That needs no stored relation, does not change what a snap is, and would also mend figures drawn before this entry (corners 2e-5 inside the real rim), moving a corner by at most 1e-4 mm. It widens what the entry decided, so it waits for the human.

**Built the geometric test (`in_1387`).** `graph.ts`: `bodyRims` (a body's circular edges and its round faces along a world axis, at their exact numbers) and `ontoRim`: a corner of a figure within 1e-4 mm of such a circle, in the figure's plane (a rim lower down counts, by where it falls on the plane), is put on it exactly and sent to a trillionth; the relation of the first version is not asked for (`heldToBody` is gone). Two things it had to do: (1) `keepStraight`: a corner that lay on the straight run between two neighbours that moved stays on the run (the user's own figure has a side of two lines in a row; moved ends alone gave an invalid solid, as in `in_1370`); (2) a corner at a body's own vertex (the ends of the halves of a rim) is left where it is, as exactly there the kernel returned an invalid solid for the user's file (the retry mends it, as before). Tests, `cutmeshes.test.ts`: corners exactly on a rim with no relation at 40 angles (1 of 40 failed before), corners 1.9e-5 inside as an older file has them at 20 angles, the relation case at 8, and the user's file; all pass. A first try also retried an invalid cut with the fuzzy boolean; it was not needed and cost a validity check on every cut, so it was taken out.

**Kept as they are:** the check and retry with the fuzzy boolean (`in_1368`, `in_1371`), for the files already made, whose corners are stored rounded and for a corner typed in near a surface that no snap made; healing the face in the kernel is a later step, only if a sliver is still seen after this.

**Not decided (to look at when building).** (a) Whether a drawing opened from a file with a corner that has the relation is held again against the exact circle when it is solved (which would mend old files with no change to what is stored), or stays as stored. (b) The straight edges and corners of a body (`anchorLines`, `anchorCorners`) have the same two roundings; this entry is written for the circular edge and should be extended if the same failure is seen there. (c) The rod volume failures of `in_1382` are a different bug and are not part of this.

**How it is judged.** `cutmeshes.test.ts` (its minimal case, its file, and a case with a rim of radius 12.500019), the prototype's table through the app's own path, `pistonmaker`, `rodmaker`, `pistonhonda` unchanged, and the full suite compared with the known failures.

## Rationale

The cut is a boolean between two surfaces that must meet exactly or be clearly apart; a corner a few millionths inside a curved face is neither. Rounding the number twice on its way from one place to the other cannot be made safe by choosing a better grid, because any grid puts some corners in the band; the numbers must not be copied and rounded between the body and the sketch. The relation is already there, so exact numbers behind it, only for the points that have it, is the smallest change that removes the cause for every cut on a curved edge, not only the one file.
