---
id: q_clearance_profile
kind: question
status: open
origin: ai-unreviewed
human_input: in_1233, in_1239
date: 2026-11-19
depends_on:
  - dec_engine_model: the engine model's own running clearance ("room", 0.15 mm a side by default) is a plain number the person types; Honda's nominal fits are 5 to 10 times smaller
  - prin_manufacture_agnostic: the principle bars printing clearances and route presets from the modeler; a "printable profile" would be one, so it is not an option
alternative_to:
---
# Which clearance defaults should the engine take: Honda's nominal fits or the model's 0.15 mm room?

**Corrected, `in_1239`'s session:** I first proposed an "engineering" and a "printable" clearance profile. **That conflicts with the accepted `prin_manufacture_agnostic`** (no printing clearance, no route presets in the modeler), so it is withdrawn: compensating a model for a printer belongs to the separate manufacturing module. What remains is a plain geometry question. A real engine's nominal fits are tiny (Honda: piston to bore 0.015 to 0.050 mm, ring side 0.015 to 0.045, pin 0.002 to 0.014); the engine model's own `room` is 0.15 mm, a number the person types. **Options:** (1) keep `room` at 0.15 mm and use Honda's numbers only where the model has a place for them (the ring grooves, built); (2) make Honda's nominal fits the defaults (a gap of 0.015 mm is thin to see and may need the kernel's tolerance checked; `room` would be typed by the person); (3) keep both as two typed numbers (`room` for the moving parts, the piston's fits from Honda). **Recommendation, not a decision:** option 3 for now.

## Rationale

The piston parameter list carries Honda's nominal fits as sourced numbers; the engine model has one room number for every moving part. Which of them the builder shows as its defaults decides how the piston looks in the model, and the human's principle decides what may not be offered.
