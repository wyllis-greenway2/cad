---
id: dec_piston_hollow
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1237, in_1244, in_1246
date: 2026-11-19
depends_on:
  - dec_piston_belt: the hollow piston's walls follow the ring belt (the cavity is narrower under the grooves) and the pin height; a change to the belt changes the cavity
  - dec_piston_parameters: the rules built here are its assumed rule A6 (crown thickness), now with a skirt wall half as thick as the crown
  - dec_clearance_defaults: the pin's room in its bore is a typed fit; no number here is shaped by how the engine is made
alternative_to:
---
# The hollow piston: a crown, a wall half as thick, and two pin bosses

The human approved (`in_1246`) building the hollow piston with the skirt wall I proposed: **half the crown thickness**. **Built**, every number **assumed** (nothing here is Honda's; no source gives a piston's wall):

- **Crown thickness** (A6): a typed proportion of the bore, **0.08** (NACA 895 compares 0.04 and 0.15; a book summary 0.055 to 0.10).
- **Piston wall:** a typed proportion of the bore, **0.04** (half the crown: the human's approved choice). It is the thickness of the skirt and of the metal under the ring grooves' floors.
- **The cavity** is open at the foot of the skirt: a wide part (the piston's radius less the wall) from the foot up to the bottom of the ring belt, and a narrower part under the belt (the radius less the grooves' depth less the wall) up to the crown's underside.
- **Pin bosses (a new assumption, A12):** two pads either side of the rod's slot (the rod's thickness and its room), from a wall's thickness below the pin's hole up to the crown's underside, as wide as the piston's wall allows; the pin's hole goes through them and the walls. The old cut for the rod's slot is no longer needed: the rod swings inside the cavity.
- **The pads' width:** as wide as the metal behind them allows (a pad must not stand in a groove): below the ring belt up to the piston's outside, in the belt's zone up to the grooves' floors. A test of the piston's volume against one worked out from the numbers (within 0.3 %) found that a first version let the pads stand in the grooves; it was fixed.
- **New refusals** (plain geometry, not assumptions): the rod swinging wider than the cavity; walls and grooves that leave no room inside; a crown so thick that the rod's eye cannot reach under it (the pin height takes the crown into account).
- **Not built:** A7 (skirt oval and taper: 0.07 mm at 68 mm, below what the model draws), A8 (oil drain holes: a drain hole needs the groove floor and the cavity, which now exist; it is the next step if the human wants it) and A9 (groove radii).

## Rationale

The human approved the wall (`in_1246`). A crown thickness only means something on a hollow piston, and a hollow piston needs a wall and bosses; the wall is the human's choice, the boss reach one more assumption (a wall's thickness beyond the pin's hole), flagged here and in the code.
