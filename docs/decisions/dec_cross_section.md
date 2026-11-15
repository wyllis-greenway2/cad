---
id: dec_cross_section
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_392, in_394
date: 2026-11-15
depends_on:
alternative_to:
---
# Cross section: a view of the model cut by a plane

`in_392` asked for a cross-section slice tool to see inside parts: a view, not a cut; x, y and z planes offered at the middle of the part; a click slices to that plane; the plane moved with the xyz or the rotate handles. **The AI's reading, for the human to correct:** View › Cross section offers three faint planes through the middle of the model's box; a click on one makes it the section (the part of the body and of the drawn lines on its positive side is not drawn, both faces of what is cut are shown); its arrows along x, y, z move it and its rings about x, y, z turn it; the same menu row (or Esc while choosing) puts it away. It is state of the view (`AppState.section`), not of the model: no step, no history, not saved in the file, and the kernel's solid, the export and the picking are untouched. **Reworked after `in_394` (again the AI's reading):** it begins at once as one semi-transparent plane through the middle of the part, across the axis the camera looks along, cutting away the half nearer the camera; chips on the plane swap the axis (X, Y, Z), swap the half cut away, and switch the handles between moving (arrows, the default) and turning (rings); where the plane cuts a solid the cut face is drawn solid and hatched with slanting parallel lines (a stencil count along each line of sight, no mesh is cut); a right click, Esc or the menu row puts it away. Not built: typing a position or angle, keeping it across a save. (The old text follows.) Not built: a cap (a flat filled face where the plane cuts, so the cut looks solid), typing a position or an angle, keeping the plane across a save, flipping which side is kept, slicing the kernel mesh for picking.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
