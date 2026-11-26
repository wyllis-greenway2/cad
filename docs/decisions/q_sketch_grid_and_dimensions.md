---
id: q_sketch_grid_and_dimensions
kind: question
status: open
origin: ai-unreviewed
human_input: in_1574
date: 2026-11-25
depends_on:
  - dec_dimensions_measure_then_lock: the dimension half is answered by it (accepted, `in_1590`)
  - dec_grid_ui_only: the old app's grid is display-only; this asks whether the rebuild should keep that
---
# How dimensions are handled: which of the old app's ways? (the grid is decided: no snapping)

The human, after seeing the behaviour list: "I am not sure about the grid or how dimensions are handled" (`in_1574`). Two things the rebuild does differently from the old app, shown so they can choose (`docs/rebuild/prototype_look_and_feel.md`):

**The grid.** *Old app:* display only; free points are rounded to 0.01 mm and do not snap to the grid (`dec_grid_ui_only`). *Rebuild:* a point snaps to a grid crossing within 10 px. **Decided by the human: toss snapping to the grid** (`in_1580`): the grid is display only (`dec_grid_ui_only`), a free place rounds to 0.01 mm; snapping to points, midpoints and alignments stays (`dec_helpers_one_rule`). Built: `refOf` has no grid.

**Dimensions.** *Old app:* a dimension is a number with an open padlock (measured only) or a closed one (locked); the measured number of a line, circle, arc or pair of lines shows at once when the part is selected; clicking the padlock locks it at the number it measures now, clicking again frees it; clicking the number types a new one and locks it (`CN-8`, `CN-35`, `CN-37`). *Rebuild:* nothing shows until a number is put on (the bar's ruler, or the D key now removed), and every dimension is locked. **Recommendation (not decided): the old app's way.** It needs the engine to hold a dimension as measured-only (no row) or locked (a constraint); the solver already has both (a row is a constraint; a measure is a read).

## Rationale

The human's own wording is "not sure"; both recommendations are the AI's, from the old app's behaviour, and stay open until they decide.
