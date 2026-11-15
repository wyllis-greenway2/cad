---
id: q_sheet_planes
kind: question
status: open
origin: ai-unreviewed
human_input: in_446
date: 2026-11-15
depends_on:
alternative_to:
---
# The cross section plane as a generic sheet (several at once, four modes, a face to sketch on)

`in_446` asked for the cross section plane to become a generic plane entity. Nothing is built yet; this is the AI's reading of what was asked and the order it would build it in, for the human to correct.

**What exists (`dec_cross_section`):** a plane part with `section` and `cut` flags, one at a time (`sectionNow`), view state only, drawn as a see-through plane with its own chips, moved by arrows and rings, the cut half ghosted, the cut face hatched.

**What was asked, as read**
1. **A plain plane part**, translucent grey like the world panes, with no cross-section meaning of its own: the cutting is one of its modes, so other tools can use planes (a mirror plane, a sweep path's plane, a sketch plane).
2. **One icon on it** that cycles four modes with each click: *cuts the side its normal points to*, *cuts the other side*, *does not cut*, *invisible* (more see-through, takes no pointer pick, only the icon fades in on hover so the mode can be left).
3. **Otherwise a face** (when not invisible): it can be selected and a sketch started on it as on any face.
4. **Push / pull arrow that moves the plane along its normal** (no body is made), and **a second icon** that switches it to the mover (xyz arrows and the orient orb); the move icon also cycles *free*, *X*, *Y*, *Z plane*, and coming back to *free* returns to where it was last.
5. **More than one plane cutting** one model at a time (each its own mode).

**Questions that change the build**
- *Saved or view-only?* Today a section is not saved. A plane that is a face to sketch on has to be part of the model (and so in the file and the history); the AI would make planes saved parts and keep the cut modes in the part (saved too), unless the human wants the cutting to stay view-only.
- *Where do planes come from?* Today one begins at once from the View menu. The AI would add *Plane* to the menu (a new plane through the middle of the model, across the axis the camera looks along) and keep *Cross section* as the same thing begun in a cutting mode.
- *Hatching with several planes:* the cut face is hatched where a plane cuts a solid; with several planes the AI would hatch each plane's cut face and clip the solid by all of them.

**Recommended order:** (a) the plane as a saved generic part with the one mode icon and the invisible mode, (b) several cutting at once, (c) sketching on it and the push / pull arrow moving it, (d) the move icon with the X / Y / Z cycle and the remembered free place. Say which of the three questions to answer differently, or go ahead.

## Rationale
The request touches the file format (saved planes), the picking rules (an invisible plane that does not pick) and the clipping of the view, so it is asked before it is built.
