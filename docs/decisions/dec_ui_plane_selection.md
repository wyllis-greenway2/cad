---
id: dec_ui_plane_selection
kind: decision
status: accepted
origin: human
human_input: in_015
date: 2026-11-04
depends_on:
  - dec_ui_build_order: this is stage 1 of the staged interface build
---
# 3D view with infinite XYZ planes; select a plane to sketch; go normal to it

What the human specified (`in_015`): the 3D view shows XYZ planes that go on forever. You select a plane
to sketch on, and the view goes normal to that plane. You can still orbit in 3D, and clicking on the plane
brings the view back normal to it.

How `prototypes/cad-ui` interprets this (AI choices, not yet reviewed by the human): each plane is an
infinite grid that fades with distance; selecting a plane animates the camera to a standard, un-mirrored
view (XY from above, XZ from the front, YZ from the right); the click that returns to normal only acts when
the view is tilted; unselected planes dim; plane buttons exist as a fallback.

## Rationale
This is the human's stated interaction model. It keeps orientation obvious (sketching always starts
face-on) while leaving free 3D navigation, which matches the blueprint's sketcher section.
