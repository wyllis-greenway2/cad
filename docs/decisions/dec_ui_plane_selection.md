---
id: dec_ui_plane_selection
kind: decision
status: accepted
origin: human
human_input: in_015, in_016
date: 2026-11-04
depends_on:
  - dec_ui_build_order: this is stage 1 of the staged interface build
---
# Planes: hover sheets in 3D, grid only in sketch mode; select a plane, go normal to it

What the human specified (`in_015`): the 3D view shows XYZ planes that go on forever. You select a plane
to sketch on, and the view goes normal to that plane. You can still orbit in 3D, and clicking on the plane
brings the view back normal to it. Refinement (`in_016`): the grid was hard to see, so there should be no
grid in the 3D view; the grid appears only in sketch mode. In 3D mode, a semi-transparent sheet appears on
whichever plane is hovered, to select it.

How `prototypes/cad-ui` interprets this (AI choices, not yet reviewed by the human): the hover sheet is a
finite square around the origin (an infinite sheet covers the whole screen, so there is nothing to
hover or miss); the grid is infinite and fades with distance; selecting a plane animates the camera to a
standard, un-mirrored view (XY from above, XZ from the front, YZ from the right); in sketch mode only the
sketch plane can be picked and Esc leaves sketch mode; the click that returns to normal only acts when the
view is tilted; plane buttons exist as a fallback.

## Rationale
This is the human's stated interaction model. It keeps orientation obvious (sketching always starts
face-on) while leaving free 3D navigation, which matches the blueprint's sketcher section.
