---
id: dec_piston_belt
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1237, in_1244
date: 2026-11-19
depends_on:
  - dec_engine_presets: the ring belt is laid out from Honda's ring heights and the engine's typed fits, and the Honda test must still hold
  - dec_piston_parameters: the rules built here are its assumed rules A1, A2, A3 and A5; the human approved building the assumed rules (`in_1244`) after asking for them to be marked as assumptions (`in_1237`)
  - dec_clearance_defaults: the ring's side room is a typed fit; no number here is shaped by how the engine is made
alternative_to:
---
# The ring belt and the pin height, built from the assumed rules

Built (`in_1244`), each number **assumed** unless Honda's, and marked so in the code (`operation/pistondesign.ts`) and in the engine's box:

- **A1, the lands between rings:** 1.6 times the compression ring's height (2.4 mm for Honda's 1.5 mm ring; NACA 817's lands were 1.4 to 2.0 times its grooves).
- **A2, the top land:** a typed proportion of the bore, **0.07** (a Springer summary gives 0.04 to 0.10 for gasoline engines); it was a remembered 0.12.
- **A3, the groove depth:** the ring's radial width plus a back room of 0.45 mm. The radial width is the bore over 22 (the thicker series of ISO 6622-1, from a search summary), so the depth is B/22 + 0.45.
- **A5, the pin height (the distance from the pin's axis to the crown):** the **stack**, no longer 0.55 of the bore: the ring belt (the top land, then each groove with the land below it) plus the larger of (the pin's radius + 0.05 of the bore: A5) and (the rod's small eye and the web above its slot: 2.5 mm beyond the eye, plain geometry the slot needs). It is 28 mm (0.41 B) for a GX160 and was 0.55 B; NACA 817's 0.44 B and a motorcycle catalogue's 0.30 to 0.33 B bracket it (unconfirmed). Nothing is refused for being outside that bracket: an assumed number does not refuse a design.
- **The oil ring groove:** a new typed number **Oil ring groove (0 or 1)**, default 1: the Honda pack is two compression rings and an oil ring. The oil groove is the oil ring's height (2.5 mm for Honda's bores, 2.0 for small ones) plus the side room, below the compression grooves.
- **What was removed:** the two refusals that the remembered proportions needed ("the ring grooves run into the pin's boss", "the piston is too short for the pin"): the pin height is now worked out from the belt, so they cannot happen.
- **A4 (the pin) is Honda's 0.265 of the bore** already; **A10 (weight)** has no rule: the Measure tool works it out from the volume.
- **Then built (`dec_piston_hollow`, `in_1246`):** A6, the crown thickness, with the hollow piston and a wall half as thick. **Not built:** **A7 (skirt oval and taper), A8 (oil drain holes) and A9 (groove radii)**; the rest of this bullet is what was true before the hollow piston. The piston is a solid cylinder with a slot; a crown thickness, drain holes and a skirt wall need a **hollow piston**, which needs a skirt wall thickness and a boss shape that no source gives (a new assumption, not one the human has seen); the skirt's oval (0.001 of the bore, 0.07 mm at 68 mm) and the groove radii (0.1 to 0.25 mm) are far below what the model draws. They wait for the human's decision on the hollow piston.

## Rationale

The human asked for the assumed rules to be built (`in_1244`), each marked assumed. A1, A2, A3 and A5 describe one thing (the ring belt and where the pin sits) and can be built on the model as it is, and the Honda test checks the result against the real engines. The rest need a hollow piston, which is a design step with a number nobody has given; building it silently would invent that number.
