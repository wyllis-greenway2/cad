---
id: dec_ui_plane_selection
kind: decision
status: accepted
origin: human
human_input: in_015, in_016, in_017, in_018, in_019, in_020, in_021, in_022, in_023, in_024, in_025, in_028, in_030, in_031
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
charcoal fog, and when you go back into 3D mode you can select any plane again. Refinement (`in_021`):
un-select the selected grid when you go back into 3D mode; a darker charcoal grid; drop every blue tint (only
paper gray and charcoal greys remain, plus the world axis colors); a much darker charcoal fog.
Refinement (`in_022`): the fog is world fog, not on the planes, as if the whole world is dark and a light shines on
the plane: the plane keeps its own color and fades into the dark world with distance. Refinement (`in_023`): at low
angles the camera should visibly go through the plane; the plane must not separate, fade away or dissolve with
viewing angle, only recede into the world fog toward the horizon. The exact colors, opacities, fog, grid and
arrow values are the human's own, tuned by hand with a temporary panel and pasted back (`in_024`, `in_025`);
they are applied verbatim in `settings.js` and are not AI choices. Refinement (`in_028`): the sheets should be lighter
and brighter but still transparent so objects behind them stay visible, with the fog fading away behind them and
replaced by a slight back light. AI interpretation: a backlight that is screen-blended onto what is behind the sheet
(so it is see-through), fading with distance into the dark world; the D key no longer toggles a theme (D is dimension).
Refinement (`in_030`): the human wants to adjust how bright a sheet is independently of how transparent it is, and the
backlight area separately, with the fog behind the sheets and not only on top of them. AI interpretation: brightness (screen
glow), opacity (sheet-colored veil), grid line strength, a "backlight area" falloff for the sheet, and a separate world fog
that fades objects.
Refinement (`in_031`): the human tuned these values by hand and they are applied verbatim (world #242424, sheet #f3f0e7, brightness 1.2,
opacity 0.5, grid 0.5, fine 0.5, world fog 0.5 to 2.5) and are not AI choices; and asked for the sheets to be slightly reflective.
AI interpretation: a subtle sky sheen plus a real mirror image of objects, both strongest at glancing angles (Fresnel), with knobs. You select a plane to sketch on,
and the view goes normal to that plane. You can still orbit in 3D, and clicking on the plane brings the
view back normal to it. Reduce clutter: no XYZ buttons.

How `prototypes/cad-ui` interprets this (AI choices, not yet reviewed by the human): "only the selected
sheet" means unselected planes are hidden; in 3D mode the hovered plane previews blue (otherwise nothing
could be found or picked); "going back into 3D mode" is read as orbiting away from the face-on view, which drops the sketch plane
(pan and zoom do not); in the sketch view only the sketch plane exists; the selected plane shows the finest grid level; the light theme is the default and D toggles
dark for comparison; fog is by distance from the camera; selecting animates the camera to a standard, un-mirrored
view (XY from above, XZ from the front, YZ from the right); Esc leaves sketch mode; the click that
returns to normal only acts when the view is tilted; a single status line is the only text.

## Rationale
This is the human's stated interaction model. It keeps orientation obvious (sketching always starts
face-on) while leaving free 3D navigation, which matches the blueprint's sketcher section.
