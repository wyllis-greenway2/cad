---
id: dec_hypoid_gears
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_915, in_902, in_903
date: 2026-11-18
depends_on:
  - dec_spiral_bevel_gears: a hypoid pair is that pair with the ring's axis moved off the pinion's; the tooth maths, the bodies and the limits are that decision's
alternative_to:
---
# Hypoid gears (accepted in_915; the prototype is `prototypes/hypoid`)

**Proposed, for the human to approve (`in_902` asked to build it; the tool needs an accepted entry first):** Gear > Hypoid: a pinion and a ring gear at 90 degrees whose axes miss by an offset; the spiral bevel tool's model with one more number.

**What the prototype does (measured, kernel, 20 / 40 teeth, module 3, 35 degrees):** the pinion is the envelope of a crown gear with circular-arc teeth through the apex, as the spiral pinion is; the ring is the envelope of the pinion with the ring's axis offset by E (the extra term of the gearing law is closed form). The ratio of roll stays z1 / z2 (Stadtfeld, Gear Technology July 2015: the offset adds the distance between the apexes and keeps the coupling). The pinion's pitch angle is not z1 / z2 any more: it is found so that the contact lines of the two flanks lie either side of the mean point (a rule of mine; **none of the four PDFs gives the pinion pitch angle or the offset limits**, they give machine settings only). **Offset 0 reproduces the spiral pair (1.7 mm3).** **Offset -20 mm (pinion below the ring's axis): 1.0 mm3 at the place, 2.0 rolled by 0.05, 462 mm3 half a pitch round**; the pinion's cone is 30.9 degrees and the ring's 60.4 (spiral: 26.6 and 63.4), the direction real hypoids take. **24 / 36, offset -15: 1.0 mm3.** **Not yet working:** the other direction (+20: 134 mm3 overlap, the contact is off the face), and the pinion's cone cut in the kernel for 18 / 36 offset -25 and 20 / 30 offset -12 (the pinion cone is 32 to 37 degrees there: nothing in common in every cone position).

**Proposed limits for a first tool:** the pinion below the ring's axis only; offset up to about 0.1 of the ring's pitch diameter until more pairs are measured; the spiral tool's tooth counts, angle and pressure rules. The pinion's spiral angle is the input; the ring's follows from the offset.

## As built (`in_915`)
In the Spiral bevel tool (menu "Spiral hypoid"): a field **Hypoid offset** (mm; 0 is the spiral bevel pair; `BevelSpec.offset`). `spiral.ts`: `spiralPairOf` takes the offset, solves the pinion's pitch angle (bisection) and gives each gear its axis point and mean cone distance (`SpiralGear.origin`, `rho`); the ring is the envelope of the pinion with the offset term in the closed form (`ringPoint`); the planes across a gear are measured from its axis point. `mesh.ts` moves the partner's apex by the offset along the direction across both axes; the linked partner takes the offset (`gearscene.ts`). Limits: offset 0 to 0.12 of the ring's pitch diameter (the first measured pairs were 0.11 to 0.14), the pinion below the ring's axis only, **the spiral tool's limit of 56 teeth in all** (the prototype's 20 / 40 and 24 / 36 pairs, 60 in all, are over it). **Measured through Mesh gear (tests):** 20 / 36 teeth, offset 12 mm, 35 degrees: 1.1 mm3 at the place, 455 half a pitch round; 24 / 30, offset 9: 0.16 and 440.

## Rationale
The human asked for it (`in_902`). The prototype shows the general gearing law gives a conjugate pair with an offset, so no sources beyond those read are needed for a first version; what they do not give (the pitch angle rule, the limits) is stated as mine, to be checked against the intrinsic pitch cones paper and ISO 23509 if the human wants them read.

## Limits opened (`in_927`)
The pairs the prototype could not cut (20 / 30 at offset 12) make now (3.8 mm3). With the offset limit lifted (`prototypes/cone-cut`), 20 / 40 at module 3 and 35 degrees fits at 24 mm (0.16 of the ring's pitch diameter: 3.9 mm3) and 29 mm (0.2: 10 mm3); 24 / 36 at 22 mm (0.17) overlaps 12.6 mm3; offsets of 25 mm (18 / 36) and 36 mm (20 / 40) make no tooth outline. **The limits are now an offset of 0.15 of the ring's pitch diameter** (was 0.12), **80 teeth in all and a ratio of 2.55** (as the spiral pair's).

## The ring gear's flank stops short of the root (`in_956`)
**Reported:** the teeth of a 16 / 24 pair at offset 6 (module 2, 30 degrees) came out ragged (the ring's). **Found:** with an offset the ring gear's flank, the envelope of the pinion's, does not reach the root cone in the planes across its axis (1 to 4.5 mm short; at zero offset it is within 0.7 mm), and the outline went straight down at the same azimuth for the rest, a different lean from the flank's, so the loft between planes twisted. **Tried, no help:** a finer split (16 steps), a split for each plane (worse), a longer range of heights or of angles on the grid (the surface has no conjugate points there). **Fixed:** below its lowest point the offset ring's flank goes on along its own lean (`curveOf`, `lean`); zero offset and the pinions are unchanged. Seen in a rendering of the exported mesh before and after; overlap of the user's pair 0.4 mm3 at the place, 89 half a pitch round (`hypoid.test.ts`).

