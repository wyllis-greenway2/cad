---
id: dec_ui_plane_selection
kind: decision
status: accepted
origin: human
human_input: in_015, in_016, in_017
date: 2026-11-04
depends_on:
  - dec_ui_build_order: this is stage 1 of the staged interface build
---
# Infinite gray planes with light grid and fog; blue when selected; click to sketch, go normal

What the human specified (`in_015`, refined in `in_016` and `in_017`): the 3D view shows XYZ planes that go
on forever, as infinite semi-transparent sheets. Each sheet has a very light gray grid (the grid shows
whether you are zooming). The view has distance fog so far things fade. Things are either gray (not
selected) or blue (selected). The world axis lines keep their colors. You select a plane to sketch on,
and the view goes normal to that plane. You can still orbit in 3D, and clicking on the plane brings the
view back normal to it. Reduce clutter: no XYZ buttons.

How `prototypes/cad-ui` interprets this (AI choices, not yet reviewed by the human): the hovered plane
previews blue; unselected planes show only the main grid levels, the selected plane shows the finest
level too; fog is by distance from the camera; selecting animates the camera to a standard, un-mirrored
view (XY from above, XZ from the front, YZ from the right); clicking a different plane while tilted
switches to it; Esc leaves sketch mode; the click that returns to normal only acts when the view is
tilted; a single status line is the only text.

## Rationale
This is the human's stated interaction model. It keeps orientation obvious (sketching always starts
face-on) while leaving free 3D navigation, which matches the blueprint's sketcher section.
