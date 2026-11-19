---
id: q_clearance_profile
kind: question
status: open
origin: ai-unreviewed
human_input: in_1233
date: 2026-11-19
depends_on:
  - dec_engine_model: the engine model's own running clearance ("room", 0.15 mm a side by default) is the printable one; a real engine's clearances are 5 to 10 times smaller
alternative_to:
---
# Should the engine builder make real engineering clearances or printable ones?

A real small engine runs its piston in the bore with a skirt clearance of 0.015 mm (GX160) to 0.05 mm (a forged kit), ring side clearances of 0.015 to 0.1 mm and ring end gaps of 0.2 to 0.4 mm. A 3D printer (and the project's purpose, functional printing) cannot make that: its running clearance is of the order of 0.2 mm a side, which is what `dec_engine_model` uses today. Offering both would give the same engine as a **drawing to engineering numbers** or as a **printable model**. **Options:** (1) one profile, printable (what exists); (2) two profiles, the human picks per engine, default printable; (3) two profiles, default engineering. I have no source for printable clearances and would not invent them: the human or a printing guide would have to give them. **Recommendation, not a decision:** option 2.

## Rationale

Every clearance in `dec_piston_parameters` has an engineering value from a source, and the printable value is a different number; the parameter list cannot be finished until it is known which the builder makes by default.
