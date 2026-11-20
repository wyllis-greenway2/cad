---
id: dec_engine_model
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1197, in_1198, in_1206
date: 2026-11-19
depends_on:
  - dec_gear_models: the engine is one of the models (the same placement tool, parts built one at a time, Play); a change to how models are built or played changes it
  - dec_glue: the flywheel is glued to the crankshaft and the pin to the piston so that Play carries them
  - dec_mechanism_motion: the rod and the piston move by a table of the exact slider crank, per degree of the crank (the cam follower's table), not by a constant ratio
alternative_to:
---
# A piston engine as a model, built from master numbers (stage 1: one cylinder)

The human asked for a piston maker and then, because the parts must relate exactly, a whole engine builder (`in_1197`, `in_1198`), and told me to go ahead (`in_1206`). **Stage 1 is one cylinder**: *Models > Piston engine*. Later stages (not approved yet): inline 2 to 4 cylinders with the crank throws phased, a valve train, V and boxer layouts, rings fitted into the grooves, a pneumatic or hydraulic cylinder as a catalogue path.

- **Master numbers:** bore, stroke and rod ratio (crank radius over rod length). The rest are the pin's diameter, the shaft's, the wall, the flywheel's, ring grooves (0 to 3) and the room round moving parts. The Size box grows every length (not the ratio, the count or the room).
- **Parts (seven bodies since `dec_rod_design`, `in_1250`: the rod's big end is split and the cap is a body of its own; six when this entry was written):** Block (floor, cylinder tube and closed head), Crankshaft (shaft, crank disc, crank pin), Flywheel (glued), Piston (grooves, a slot for the rod, a pin hole), Piston pin (glued to the piston), Connecting rod (two eyes and a tapered beam).
- **Exact motion:** the crank is the driver; the piston slides by x = r cos a + sqrt(l² - r² sin² a) and the rod leans by asin(r sin a / l) about its big eye while the eye goes round with the crank pin. Two tables (a value for each whole degree) carry this; tested against the formula at several angles, and that at rest no two parts share volume. The block is held; the crankshaft is a pivot.
- **Refusals:** a rod ratio outside 0.2 to 0.5, a pin outside 0.18 to 0.4 of the bore, a stroke too short for the shaft and crank pin, a flywheel smaller than the crank disc, a slot wider than the skirt allows, ring grooves that reach the pin boss, a rod so short that the skirt would hit the crank disc at the bottom of the stroke or the big end reach the tube, and a rod that would hit the cylinder's wall.
- **What is real and what is not.** The kinematics is exact. **The proportions are rules of thumb from memory of engine practice, not read in a source**, and not standards: the ISO standards for rings (6621) and pins (18669) are paid and were not read, so no dimension of them is used (`docs/sources/README.md`). The model says this in its box. It has no valves, no ports, no ring (only grooves), no lubrication, no gasket, and the crank is a disc with an overhung pin (the rod is held on only by the pin's end sticking out; a printed engine needs a clip or a cap) [**since `in_1252` the crank has two webs with counterweights and Honda's crank pin: `dec_crankshaft_design`**]. The static fit is checked at rest and by formulas at the other angles, **not by sweeping the kernel through the cycle**.

## Rationale

The parts' sizes depend on one another (the stroke sets the crank and the rod's travel, the rod ratio sets the rod, the bore sets the piston and cylinder), so separate piston, rod and crank makers would disagree; one maker with master numbers cannot. Stage 1 is the smallest engine that has all of these relations and a motion that can be tested exactly.
