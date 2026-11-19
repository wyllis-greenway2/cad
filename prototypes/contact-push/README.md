# Contact push (a prototype, `in_894`)

**What it was meant to learn:** whether a very simple rule (move the played joint a little; if it overlaps, move the other body along its own joint by the smallest amount that clears it; if it cannot, stop) is enough to reproduce a mechanism that is normally given a formula, using only the mesh test the hard bodies already use (`app/src/operation/collide.ts`, no kernel booleans), and what that costs.

**What it is:** `run.ts` makes the Geneva drive as a 3D model through the app's own modules, takes the face meshes of the wheel, the locking disc and the crank, turns the crank and the disc a degree at a time, and moves the wheel by the smallest angle that clears it of the pin and the disc (doubling the distance until clear, then halving to the nearest). The result is compared with `genevaTurn`. Run: `node prototypes/contact-push/run.ts` (from the repository root); `SLOTS`, `CRANK`, `CLEAR`, `TURNS`, `TRACE` and `DIAG` set the drive and what it prints.

**What it learned:**

| slots | crank mm | clearance mm | worst gap to the formula (degrees) | jams | ms a step (average) |
|---|---|---|---|---|---|
| 4 | 15 | 0.3 | 2.7 | 0 | 2.3 |
| 5 | 20 | 0.3 | 1.2 | 0 | 3.4 |
| 5 | 20 | 0.6 | 2.4 | 0 | 2.1 |
| 8 | 25 | 0.3 | 0.4 | 0 | 5.1 |

(Three turns each; the wheel ends within 0.6 degrees of the formula's slot count, so the error does not add up. Timings are from a shared sandbox CPU in Node, not a user's machine; the slowest single steps were 13 to 83 ms, unexamined: the first use of a body or garbage collection.)

- The rule alone reproduces the Geneva's step: the wheel waits while the pin is out, follows the pin through the slot and the locking disc holds it between visits. The difference from the formula is the clearance round the pin: the wheel follows the wall the pin presses.
- **A face resting on a face counts as a hit** in the existing mesh test (its nudge to break ties goes one way): the crank's plate under the wheel was "colliding" with it whenever it was over it. A mechanism of layers needs only the part that overlaps in height to be tested; here only the pin's triangles are used.
- A collision test costs about 0.2 ms for a pair of a thousand triangles each; about 11 tests a step after the search was made a doubling and a halving (it was 17 to 21 with a plain scan).
- **Not tried:** a ratchet's pawl with a rest value, a gear train with passed-on hardness, a cam and follower, the time budget, the jam message, many bodies. The Geneva is one case with one free joint.

## Gear pair (`gears.ts`, `in_906`)

Gear 1 turned, gear 2 yielding by contact alone (the app's `contact.ts`): 20 and 30 teeth, module 2, backlash 0.15: within 0.3 degrees of the ratio of the teeth for a turn, no jam, 6.7 ms a degree (median; 24 ms at worst) in Node for gears of 1,300 and 1,900 triangles; 12 and 36: 0.25 degrees, 4.8 ms; 20 and 20 at backlash 0.3: 0.9 degrees; 16 and 24 at module 1.5: 0.5 degrees. **What it first showed was that nothing happened:** the face meshes (`meshOf`) of a gear body are its top and bottom only (the teeth's walls are not parts of the scene), so the gears never met. The kernel's own mesh, read by the faces' ranges, has them.

## A train of gears, all by contact (`chain.ts`, `in_937`)

Gear 1 turned and hard, every other gear yielding to the one before it (gears in a line, 20, 30, 24, 36 ... teeth, module 2, backlash 0.15), half a turn of the first:

| gears | within (degrees of the ratio, worst gear) | ms a degree, median (95th percentile) |
|---|---|---|
| 2 | 0.3 | 11 (17) |
| 3 | 0.7 | 21 (35) |
| 4 | 0.7 | 37 (46) |
| 5 | 1.7 | 65 (105) |
| 6 | 1.5 | 77 (118) |

All settle with no jam, but the cost grows with the length of the chain (about 10 to 15 ms a degree for each gear in Node on a shared sandbox CPU): at one degree a frame a six gear train is about 13 frames a second. The first try jammed at three gears: a body that yields had to be clear of every other body that yields, so a chain could not give way link by link; and the search for room doubled its distance and stepped over the gap between two teeth (a fraction of a degree wide). A touch is a hit or not by the direction the test goes, so the search stopped at a boundary that the check then found again, round and round: the test is now made both ways round.

## Made faster (`in_938`)

Profiling the gear trains showed where the time went: **a third of it was the test for a body wholly inside another** (a counted ray over every triangle of the body that stays, run for every test that found no crossing), the pairs' filtered meshes were worked out again at every call (their heights, before looking in the cache), and the search for room tried both directions at every distance. Now: the inside test is left out for the contact push (`surfaceOnly`: a motion in small steps crosses a surface first), the filtered meshes are kept with the pair (a miss too), and the search goes the way the body went last all the way out before the other way (a reversed play takes one slower step). Same chains, same accuracy:

| gears | before (median ms a degree) | after |
|---|---|---|
| 2 | 11 | 3.5 |
| 3 | 21 | 7.9 |
| 4 | 37 | 9.9 |
| 6 | 77 | 20 |

The Geneva in the app: 1.4 ms a degree median (9 ms at the 95th percentile) before, 0.4 (3 ms) after; the slowest single steps are still 17 to 30 ms (the first step of a push, when the way it went last is the wrong way). What is left in the profile is the walk of the two trees and the placing of the moving triangles (`collidesMoving`, `triOf`, `boxOf`).

## Faster still (`in_939`)

Three more things were tried:

- **A cheaper pre-check for pairs that are far apart** (the boxes of the two bodies, each where it stands, are compared before the trees are walked): built. A small gain in a chain, where the neighbours are close; it matters for a model with many bodies that are not near.
- **Starting each step from the last step's contacts:** built in two parts. The search for room begins at the push of the step before (a clear place a little short of it is found with a few tests), and only the bodies that moved since they were last tested are tested again (the driver at the start of a step, then each body that yielded, a pass at a time: a chain is a walk along it, not a test of every body again at every link). The halving is 5 steps (0.005 degrees).
- **A coarser mesh for animation:** tried, **not worth it**. The triangles of each pair were merged into the cells of a grid of 0.1, 0.2 and 0.4 mm (a gear's walls are about 1,300 triangles): the times did not change beyond the noise (a 4 gear train 8.4, 7.9, 8.4 and 9.0 ms a degree at 0, 0.1, 0.2, 0.4 mm), because the tree already keeps a test to the leaves that meet; the accuracy of the pair also did not change. Not kept.

Together (medians, Node on a shared sandbox CPU, which is noisy to about 15 per cent): a train of 4 gears 10 to 13 ms a degree before, now 6.6; 6 gears 17, now 12 to 15; 8 gears 28, now 18 to 22; the Geneva in the app 0.41, now 0.36 (the slowest step 13 ms, was 16). The accuracy is the same (0.3 to 2.2 degrees). What is left is the narrow phase: placing the moving triangles and walking the two trees (about 90 per cent of the profile), so more speed needs fewer tests (a step worked out from the contact's geometry rather than searched) or a cheaper test.

## The depth rule (`in_1019`)

Hardness is passed on to three links (`dec_contact_push`): with only the first gear hard a train of six has its first five driven and the sixth stays, with a note in the bar; `HARD=1,4 node prototypes/contact-push/chain.ts` (`N=8`) marks the fourth gear hard too and all eight are driven within 2.2 degrees, at 16 ms a degree. Five gears with the first hard: 8 ms a degree (the pairs beyond the depth are no longer tested).
