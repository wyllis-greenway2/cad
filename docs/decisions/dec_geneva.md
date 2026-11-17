---
id: dec_geneva
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_701
date: 2026-11-17
depends_on:
  - dec_spline_and_cams: the Geneva drive is one more shape of the cam tool (a record of numbers, parts made from it, Edit cam), as the ratchet is
  - prin_manufacture_agnostic: nothing here is for one making route; the clearance is a number the person sets
alternative_to:
---
# A Geneva drive: the slotted wheel and its crank, as one more shape of the cam tool

**Approved at `in_701`** as recommended (the geometry is fixed by the slot count, so it needs no unsourced standard). A Geneva drive turns a wheel one slot's step for each turn of a crank: a pin on the crank enters a slot, carries the wheel round, and leaves.

- **The geometry (exact, not a convention).** `n` slots; the crank's pin circle has radius `a`. The pin must enter each slot straight, so at the moment it enters, the line from the crank's centre to the pin is square to the slot: the centres are `C = a / sin(π / n)` apart, and the pin enters at `b = C cos(π / n)` from the wheel's centre. The wheel turns `360 / n` degrees while the crank turns `180 - 360 / n` either side of the line of centres; the pin's nearest approach to the wheel's centre is `C - a`. (`n` from 3 to 24.)
- **The wheel.** A disc of radius `b + pin diameter` with `n` radial slots, each of width pin + 2 × clearance, going in to a semicircular end where the pin is nearest the centre, and the bore. The outer edge is plain round: there is no locking disc yet.
- **The crank.** A plate with a hub (round, with the shaft's hole) and an arm of the pin's width out to the pin's circle. **Drawn beside the wheel, not on it**: in a working Geneva the crank is in a layer under the wheel, so drawn in place it would lie over the wheel; the drawing therefore puts it below the wheel, centred directly under the wheel's centre, to be moved to the centre distance `C` (shown in the box) from the wheel's centre when assembling.
- **Numbers (the box).** Slots (4), Crank (the pin circle's radius `a`, set by the pointer's distance from the wheel's shaft), Pin (diameter, a quarter of `a`), Clearance (mm each side of the pin in the slot, 0.3), Hole (the shaft's hole in both, a quarter of `a`). The defaults other than the geometry above are conventions, not sources; a slot that would reach the shaft's hole, or slots that would meet, is refused with the reason (few slots with a big pin).
- **Kept as a record**, as the cams and the ratchet are; Edit cam changes its numbers.
- **Not yet:** the locking disc and the wheel's concave locking arcs (the part that keeps the wheel from turning between engagements; the disc's notch is the envelope of the wheel's corners as the pin passes), an internal Geneva, a Geneva with more than one pin, a crank drawn in place on its own layer.

## Rationale

A Geneva drive is a shape of a few numbers whose one relation, the centre distance, is exact; the slice is the wheel and the crank, which a person can print and run (the wheel is held by a detent or by friction until the locking disc is built). Drawing the crank beside the wheel avoids a sketch whose figures lie over each other (they would be cut into pieces by every crossing), at the cost of one move when assembling.
