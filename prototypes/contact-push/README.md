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

## A train of gears, all by contact (`chain.ts`, `in_908`)

Gear 1 turned and hard, every other gear yielding to the one before it (gears in a line, 20, 30, 24, 36 ... teeth, module 2, backlash 0.15), half a turn of the first:

| gears | within (degrees of the ratio, worst gear) | ms a degree, median (95th percentile) |
|---|---|---|
| 2 | 0.3 | 11 (17) |
| 3 | 0.7 | 21 (35) |
| 4 | 0.7 | 37 (46) |
| 5 | 1.7 | 65 (105) |
| 6 | 1.5 | 77 (118) |

All settle with no jam, but the cost grows with the length of the chain (about 10 to 15 ms a degree for each gear in Node on a shared sandbox CPU): at one degree a frame a six gear train is about 13 frames a second. The first try jammed at three gears: a body that yields had to be clear of every other body that yields, so a chain could not give way link by link; and the search for room doubled its distance and stepped over the gap between two teeth (a fraction of a degree wide). A touch is a hit or not by the direction the test goes, so the search stopped at a boundary that the check then found again, round and round: the test is now made both ways round.
