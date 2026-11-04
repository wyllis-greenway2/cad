---
id: dec_grid_ui_only
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_050
date: 2026-11-04
---
# The grid is an interface feature, not a storage rule

The human chose option 1 of the former `q_grid_role` (`in_050`): the grid is used for **snapping, rounding typed or placed values (to 0.01 mm), and display**. Stored numbers are the
values the user entered; nothing forces stored geometry onto a grid, and the kernel's results are exact (not snapped). This departs from the blueprint's section 7 (storage on a 0.01 mm grid); the
blueprint in `docs/origin/` stays untouched as the human's original.

Left available, not decided: if exact replay or byte-for-byte comparison is ever needed (for example for AI-generated models), store the numbers the user entered as integer microns (inputs on
the grid, results still exact). That would not change the kernel interface.

## Rationale

The kernel prototype fused coincident faces and 1e-4 mm gaps to exact volumes without any grid, and rounding input to 0.01 mm already gives clean dimensions (40.00 x 30.00). Snapping the kernel's
results would move endpoints off the surfaces they belong to (risking leaks in the printed mesh) and cannot hold for angled faces, revolves and patterns.
