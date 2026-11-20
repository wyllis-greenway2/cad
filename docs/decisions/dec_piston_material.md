---
id: dec_piston_material
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1261
date: 2026-11-20
depends_on:
  - dec_piston_maker: these are two more of its N variables, made typed fields
  - dec_clearance_defaults: the piston's room in the bore is Honda's nominal middle (0.03 mm) for cast aluminium; the other materials take the values their sources give, and a typed number still replaces it
  - dec_piston_lands_clips: the pin is hollow with the circlips at its ends; the circlip bodies are steel
alternative_to:
---
# The piston's material (weight and the default fit) and a hollow pin

The human approved (`in_1261`). Built:

- **Material** (a typed choice): cast aluminium, hypereutectic aluminium, forged aluminium (2618), cast iron, steel. It sets the **density** (g/cm3: 2.70, 2.65, 2.76, 7.20, 7.85: **standard values from memory, not read in a source**) and the **default room in the bore** (the field is now **0 = auto**): **0.03 mm** for cast and hypereutectic aluminium (Honda's service manual middle; hypereutectic has no number of its own, so it takes cast's: assumed), **0.05 mm** for forged aluminium (Wiseco: 77.95 mm piston in a 78.00 mm bore), **0.13 mm** for cast iron (Kean: "five thousandths of an inch") and for steel (assumed: Kean says steel expands more than an iron cylinder, no number). A number typed replaces the auto one. The pin, the circlips and the rod are steel.
- **Weight:** the piston maker shows the weight of the piston, the pin and the circlips in its line under the numbers (the worked-out volume of each times its density; checked against the kernel's volumes within 0.3 %). **No source gives a real piston's weight**, so it is not compared with one.
- **Hollow pin:** a typed **Pin** choice (Solid / Hollow, default Hollow: a real pin is hollow) and the **pin bore** (0 = auto: **0.55 of the pin**, assumed: no source read gives it). A bore leaving less than 1 mm or 0.08 of the pin of wall is refused.
- **Not built:** the material's expansion (the clearances are cold, as Honda's), coatings, the pin's material and the rod's as choices.

## Rationale

The human chose them. A material gives a piston its weight, which is what a builder compares with a real one, and its fit in the bore (cast iron and forged aluminium run with more room than cast aluminium: the sources say so); a pin that is solid is heavier than any real one.
