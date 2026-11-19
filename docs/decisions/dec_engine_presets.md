---
id: dec_engine_presets
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1239, in_1240
date: 2026-11-19
depends_on:
  - dec_engine_model: the presets are master numbers of the engine model and the piston's fit numbers shape its ring grooves; a change to how the engine is made changes them
  - dec_piston_parameters: the numbers built here are its tier 1 (Honda) numbers; if the human changes any of them there, this entry's test follows
  - prin_manufacture_agnostic: the presets are real engines, not routes: no printing clearance, no kerf; the fit numbers are nominal (Honda's), typed numbers stay the person's
alternative_to:
---
# The Honda GX120, GX160 and GX200 as presets, and a test of the builder against them

The human approved (`in_1240`) the test proposed in `dec_piston_parameters` (after asking to weight the Honda data more, `in_1239`) and said to go ahead. **Built, and only this:**

- **The piston's fit numbers from Honda's service manual** (a pure module, `operation/pistondesign.ts`): compression ring height 1.5 mm and oil ring 2.5 mm for the Honda bores (60 and 68 mm), clamped to 1.0 and 2.0 mm for small bores (`dec_piston_parameters`: MAHLE packs); the defaults for the ring side clearance (0.03 mm), the end gaps (0.30 and 0.25 mm), the skirt clearance (0.03 mm diametral, measured 10 mm above the foot and at 90 degrees to the pin) and the pin's fit (0.008 mm), each the middle of Honda's range; the pin 0.265 of the bore, to the nearest half millimetre. In the model the ring grooves are the ring's height plus the side clearance (before: 5 % of the bore, a remembered number).
- **Three presets in the engine's box** ("Engine: Your own / Honda GX120 / GX160 / GX200"): bore, stroke and pin from the manual (60 x 42 and 13 mm, 68 x 45 and 18 mm, 68 x 54 and 18 mm), two compression ring grooves, the GX160's rod ratio 0.268 (from the tech procedure's rod length, `docs/sources/README.md`); **the other numbers are assumed, not Honda's**: the rod ratio of the GX120 and GX200 (the usual 0.27), and the shaft, wall and flywheel, which follow the model's own proportions at the preset's bore. A number the person types replaces the preset's, and the others follow the scale as before.
- **A test** (`test/pistonhonda.test.ts`) with Honda's published table transcribed in it: the builder's defaults for each Honda bore must lie inside Honda's ranges and equal Honda's ring heights; the presets must have Honda's bore, stroke and pin, be makeable, and build with no two parts sharing volume.
- **One assumed number was built, and why:** the skirt below the pin is now **0.27 of the bore** (rule A5 of `dec_piston_parameters`, NACA 817's reading; it was a remembered 0.35). **The test found the remembered number impossible:** with the GX160's real rod (84 mm) and stroke (45 mm) a skirt of 0.35 B hits the model's crank disc at the bottom of the stroke (it must be under 0.32 B), so the real GX160 could not be built. 0.27 B is the one sourced value in the range that works; it is marked assumed in the code and here, and the human may replace it.
- **Not built (still `dec_piston_parameters`' proposal):** the assumed rules A1 to A10 (belt stack, pin height, skirt length, crown, drain holes, ovality), the oil ring groove (the preset's "rings" are the two compression grooves), ring bodies, the clearance question (`q_clearance_profile`: the model's own `room` stays 0.15 mm). The model's box says which numbers are Honda's.

## Rationale

The human weighted the Honda data above the 1945 aircraft piston and asked for a check of the builder against the real engines. The test makes that weight mechanical: a default outside Honda's range fails; and the three presets give the "range of engines" three real examples to start from. Only the sourced numbers are built, because the rest were proposed as assumptions and have not been reviewed.
