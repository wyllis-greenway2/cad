---
id: dec_ui_plane_selection
kind: decision
status: accepted
origin: human
human_input: in_015, in_016, in_017, in_018, in_019, in_020
date: 2026-11-04
depends_on:
  - dec_ui_build_order: this is stage 1 of the staged interface build
---
# Infinite planes with light grid and fog; only the selected sheet shows (blue); click to sketch, go normal

What the human specified (`in_015`, refined in `in_016` and `in_017`): the 3D view shows XYZ planes that go
on forever, as infinite semi-transparent sheets. Each sheet has a very light gray grid (the grid shows
whether you are zooming). The view has distance fog so far things fade. Things are either gray (not
selected) or blue (selected). The world axis lines keep their colors. Refinement (`in_018`): stronger fog;
only the selected sheet is shown; try a light world instead of dark. Refinement (`in_019`): a slightly
cream-gray paper white; a dusty teal-blue; a slightly darker, more defined sub grid; the XYZ indicators built
into the main world lines (no separate gizmo); fog that gets slightly darker with distance. Refinement (`in_020`): charcoal gray grid lines, a darker
charcoal fog, and when you go back into 3D mode you can select any plane again. You select a plane to sketch on,
and the view goes normal to that plane. You can still orbit in 3D, and clicking on the plane brings the
view back normal to it. Reduce clutter: no XYZ buttons.

How `prototypes/cad-ui` interprets this (AI choices, not yet reviewed by the human): "only the selected
sheet" means unselected planes are hidden; in 3D mode the hovered plane previews blue (otherwise nothing
could be found or picked); "3D mode" is read as looking anywhere other than straight at the sketch plane,
where any plane can be hovered and selected, while the face-on sketch view only has the sketch plane; the selected plane shows the finest grid level; the light theme is the default and D toggles
dark for comparison; fog is by distance from the camera; selecting animates the camera to a standard, un-mirrored
view (XY from above, XZ from the front, YZ from the right); Esc leaves sketch mode; the click that
returns to normal only acts when the view is tilted; a single status line is the only text.

## Rationale
This is the human's stated interaction model. It keeps orientation obvious (sketching always starts
face-on) while leaving free 3D navigation, which matches the blueprint's sketcher section.
