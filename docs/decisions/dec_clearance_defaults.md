---
id: dec_clearance_defaults
kind: decision
status: accepted
origin: human
human_input: in_1242
date: 2026-11-19
depends_on:
  - dec_engine_model: the engine's own room number (`room`, 0.15 mm a side, the moving parts) stays as it is; the piston's fits are numbers beside it
  - prin_manufacture_agnostic: no clearance is shaped by how the engine will be made (printed, machined, cast): every fit is a number the person can type, with a nominal default
alternative_to:
---
# Two kinds of typed room in the engine: the moving parts' `room` and the piston's own fits

The human chose option 3 of the clearance question (`in_1242`) and said the engine builder is **not for 3D printing in particular**: the engine could be machined or cast, and it must stay manufacturing agnostic.

- **`room`** (0.15 mm a side by default, as accepted in `dec_engine_model`) stays the room round the moving parts that are not the piston's own fits: the shaft in the block, the rod's eyes on the pins, the slot for the rod, the flywheel on the shaft. It is a number the person types.
- **The piston's own fits are three more typed numbers**, with Honda's nominal middles as their defaults (`dec_piston_parameters`, tier 1): the piston's room in the bore (0.03 mm across, Honda 0.015 to 0.050), the pin's room in the piston's bore (0.008 mm, Honda 0.002 to 0.014) and the ring's side room in its groove (0.03 mm, Honda 0.015 to 0.045).
- **No profile, no preset by route.** Nothing in the modeler says "printable", "machined" or "cast": compensating a model for a way of making it is the separate manufacturing module (`prin_manufacture_agnostic`, `dec_manufacturing_contract`). The wording of the piston records is made neutral to match.

## Rationale

The human decided it (`in_1242`). It follows `prin_manufacture_agnostic` (`in_576`): a clearance is a size, with its nominal default, not a route's knowledge. Honda's numbers are the nominal fits of a real engine, which is what a person making the engine by any route would start from.
