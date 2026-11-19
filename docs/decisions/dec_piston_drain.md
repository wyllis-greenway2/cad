---
id: dec_piston_drain
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1237, in_1248
date: 2026-11-19
depends_on:
  - dec_piston_hollow: the holes go through the wall between the oil ring's groove floor and the cavity; they need both
  - dec_piston_belt: the holes sit in the oil ring's groove, where the belt puts it
alternative_to:
---
# Oil drain holes in the oil ring's groove (A8)

Built (`in_1248`), **assumed** (the rule is NACA 817's, eight 3/16 in holes in the oil grooves of a 6 1/8 in piston; Scraba mentions drain holes below the oil ring):
- A typed number **Oil drain holes (per side)**, 0 to 4, default 2: that many radial holes through the groove's floor into the cavity on each thrust side, spread from 45 to 135 degrees from the pin's axis (one: 90; two: 60 and 120; three: 50, 90, 130; four: 45, 75, 105, 135). So the default is four holes. None sit near the pin bosses.
- Each hole is **0.03 of the bore** across (A8), but never more than 0.8 of the groove's height; it is centred in the groove.
- With no oil ring groove there is nothing to drain: no holes.
- **Not built:** A7 (skirt oval and taper) and A9 (groove radii), both below what the model draws.

## Rationale

The human approved building the drain holes (`in_1248`). They finish the oil ring: a groove with a floor that has nowhere to send the oil is not a working oil control ring. The numbers stay assumptions until a small engine's piston drawing gives them.
