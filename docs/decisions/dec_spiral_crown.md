---
id: dec_spiral_crown
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_988
date: 2026-11-19
depends_on:
  - dec_crown_gears: a spiral crown gear is a crown gear (flat, pitch angle 90 degrees, the same plate, hub, blank and numbers); only the tooth's outline differs
  - dec_spiral_bevel_gears: the crown's teeth are the generating crown of the spiral model, and its pinion is the spiral pinion of that pair
alternative_to:
---
# A spiral crown gear: curved teeth on the crown gear (accepted in_988, item 4)

**Asked:** the AI listed it as an option ("a crown gear with curved teeth, built from the spiral tooth maths"); the human chose it (`in_988`: "lets do 2 3 and 4").

**Why it is simple.** The spiral model's generating gear is a crown gear whose teeth are *the bands between two cones about a cutter's axis* (`prototypes/bevel-spiral-generated`, `spiral.ts` `pinionPoint`): the pinion is generated as the envelope of it. So the spiral crown gear needs no envelope: its tooth at a height h above the pitch plane is the band between the circles of radius RW -+ (pi m / 4 - h tan alpha) about the cutter's centre (the band narrows towards the tip), cut off by the circles of the inner and outer radius; its pinion is the spiral pinion of the pair with the pitch angle asin(z1 / zc) (the straight crown's `crownShaft`). The pair is conjugate by construction, as the spiral pair is.

**As built.** `BevelSpec.spiral` on a crown gear (the Crown gear tool's field *Spiral angle*: 0 or empty is the straight crown, 15 to 45 degrees curved). `crown.ts`: `crownOf` takes the pitch radius with 1 / cos(spiral angle) (the module is the normal one at the middle of the face) and the cutter (`RW` 0.88 of it); `spiralCrownSection` makes the section (four arcs a tooth: two about the cutter's centre, two about the gear's; the same loft of two sections, blank, plate and chamfer as the straight crown, `crownscene.ts` unchanged). `spiral.ts`: `spiralCrownPairOf` and `spiralFor` take a pinion whose shaft angle is 90 degrees plus its pitch angle (the crown's) as the pinion of a crown pair. Dispatch: a crown gear goes to the crown code before the spiral code (`gearscene.ts`, `gear.ts`, `bevel.ts`); the cone retry skips it. Mesh gear from either gear makes the other (the spiral phase rule of `mesh.ts` unchanged: the crown is the "ring": its contact azimuth is the ring's) and the chamfer follows. **Limits:** the pinion 16 or more teeth, the crown at most 3 times as many (`SPIRAL.maxCrownRatio`), 80 teeth in all, 20 degrees, no hypoid offset. **Measured (kernel, `spiralcrown.test.ts` and a survey):** 40 / 18 module 2 30 degrees: 0.0 mm3 overlap at the place, 64 turned by 10 degrees; 54 / 18 (ratio 3) 0.0; 36 / 24 at 35 degrees 0.0; 48 / 20 module 3 at 40 degrees 1.0; 30 / 20 at 15 degrees 0.0; 40 / 16 module 3 0.0; 45 / 16 at 45 degrees 0.2; with a chamfer 0.0. Built from the pinion first too (0.0).

## Rationale
The crown gear is the flat limit of the bevel gear, and the spiral tooth's generating gear is one: the human asked for a good set of crown gears (`in_878`, `dec_crown_gear_set`) and this is the curved-tooth one.
