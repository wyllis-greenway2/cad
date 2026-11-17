---
id: q_wheel_tooth_loft
kind: question
status: open
origin: ai-unreviewed
human_input: in_824
date: 2026-11-17
depends_on:
  - dec_gear_speed: the wheel's loft is measured there (100 teeth 7.3 s, 200 teeth 17.5 s); this asks whether to take a further part of it off
  - dec_worm_gears: the wheel is a loft of five sections of the worm's cut; a strip per tooth is another way to make the same solid
alternative_to:
---
# Should the worm wheel be built from one lofted tooth, turned and sewn?

**Tried (`in_824`, `prototypes/wheel-tooth-loft`):** loft one tooth's open outline through the five sections as a shell, turn copies, sew them and the two caps into one shell: a valid solid, the same face count and the same volume (to 1e-8) as the whole loft. Fusing solid sectors was far worse (13 s for 40 teeth). The strips take 0.9 s where the whole loft takes 2.5 s (100 teeth) and 1.8 s against 5.5 s (200 teeth): in the app about 1.5 s of 7.3 s, and 3.7 s of 17.5 s.

**The question for the human:** is a 20 per cent saving worth building in? It means finding the names of the wheel's faces another way (they are found now by the hash of the sections' own edges; the turned copies of a strip are new shapes), so it touches the naming of every wheel face, and a bored wheel and several starts are untried. **Recommendation (the AI's, not a decision):** not yet; take the cheaper steps first (the caps are 45 per cent of the strips' time; the sections, mesh and names are over half of a 100 tooth wheel's 7.3 s). Nothing in `app/` changed.

## Rationale

A recorded question so the result of the try is not lost and the choice is the human's: the saving is real but modest, and the cost is in the naming, which other entries depend on.
