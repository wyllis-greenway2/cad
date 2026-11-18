---
id: dec_hypoid_gears
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_902, in_903
date: 2026-11-18
depends_on:
  - dec_spiral_bevel_gears: a hypoid pair is that pair with the ring's axis moved off the pinion's; the tooth maths, the bodies and the limits are that decision's
alternative_to:
---
# Hypoid gears: a proposal (not built in the app; the prototype is `prototypes/hypoid`)

**Proposed, for the human to approve (`in_902` asked to build it; the tool needs an accepted entry first):** Gear > Hypoid: a pinion and a ring gear at 90 degrees whose axes miss by an offset; the spiral bevel tool's model with one more number.

**What the prototype does (measured, kernel, 20 / 40 teeth, module 3, 35 degrees):** the pinion is the envelope of a crown gear with circular-arc teeth through the apex, as the spiral pinion is; the ring is the envelope of the pinion with the ring's axis offset by E (the extra term of the gearing law is closed form). The ratio of roll stays z1 / z2 (Stadtfeld, Gear Technology July 2015: the offset adds the distance between the apexes and keeps the coupling). The pinion's pitch angle is not z1 / z2 any more: it is found so that the contact lines of the two flanks lie either side of the mean point (a rule of mine; **none of the four PDFs gives the pinion pitch angle or the offset limits**, they give machine settings only). **Offset 0 reproduces the spiral pair (1.7 mm3).** **Offset -20 mm (pinion below the ring's axis): 1.0 mm3 at the place, 2.0 rolled by 0.05, 462 mm3 half a pitch round**; the pinion's cone is 30.9 degrees and the ring's 60.4 (spiral: 26.6 and 63.4), the direction real hypoids take. **24 / 36, offset -15: 1.0 mm3.** **Not yet working:** the other direction (+20: 134 mm3 overlap, the contact is off the face), and the pinion's cone cut in the kernel for 18 / 36 offset -25 and 20 / 30 offset -12 (the pinion cone is 32 to 37 degrees there: nothing in common in every cone position).

**Proposed limits for a first tool:** the pinion below the ring's axis only; offset up to about 0.1 of the ring's pitch diameter until more pairs are measured; the spiral tool's tooth counts, angle and pressure rules. The pinion's spiral angle is the input; the ring's follows from the offset.

## Rationale
The human asked for it (`in_902`). The prototype shows the general gearing law gives a conjugate pair with an offset, so no sources beyond those read are needed for a first version; what they do not give (the pitch angle rule, the limits) is stated as mine, to be checked against the intrinsic pitch cones paper and ISO 23509 if the human wants them read.
