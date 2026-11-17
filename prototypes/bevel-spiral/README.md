# Spiral bevel tooth as a twisted straight bevel tooth (a prototype, `in_766`)

**Meant to learn:** whether a circular-cut spiral bevel tooth can be made simply: the straight bevel tooth's sections, each turned about the axis by the developed angle of the cutter's circular arc, joined by a loft; and whether a pair of opposite hands then fits.

**The maths (`spiral.ts`):** the spiral angle at cone distance `r`: `sin b(r) = (2 Rm rc sin bm - Rm^2 + r^2) / (2 r rc)` (the formula of the Gear Technology backlash article, `in_734`); the developed angle `psi(r) = integral from Rm of tan b / r dr`; the azimuth about the axis `psi / sin(delta)`; opposite hands turn opposite ways. **Tested (passes):** the angle is `bm` at `Rm` and grows outward; `psi` agrees with `tan b dr / r` to the expected range. A 20 tooth pinion of five twisted sections lofts and keeps its volume (9015 to 9019 mm3 for 0 to 35 degrees: a twist moves, it does not add).

**Measured (20 / 30 teeth, module 2, 35 degrees, cutter 0.9 of the mean cone distance, shafts 90 degrees, 0.1 mm backlash, flat ends, five ruled sections; the intersection of the two bodies):**

| pair | overlap |
|---|---|
| opposite hands, the straight pair's place and phase | 14.8 mm3 |
| the other opposite hands (the mirror) | 14.8 |
| the same hand | 12.6 |
| opposite hands, the wheel half a pitch round | 40.1 |

**What it learned:** the straight pair of the same size has no overlap at its place. These pairs overlap by 13 to 15 mm3 whichever the hands, so the simple twisted-section model **does not make a clean conjugate pair**, and the test **cannot tell opposite hands from the same hand**. Likely causes, not separated: the ruled chords between five sections (a chord of a 0.12 rad step standing 0.04 mm off the true curve at 20 mm radius, about the backlash); the pairing of the shifts of the two members (the sign of the wheel's turn relative to the pinion's was reasoned, not proved); and the fact that a generated spiral bevel pair is not two sweeps of one profile (its tooth surfaces come from the generating process and are crowned for a localised bearing contact: the literature on the octoid and the circular-cut surfaces). **Not tried:** more sections or a smooth loft, a second measure (the gap, not only the overlap), a hypoid (nothing built: it needs the offset geometry of ISO 23509, section 5.9, not read). An earlier run failed only because the test gave the loft the last section as its first.
