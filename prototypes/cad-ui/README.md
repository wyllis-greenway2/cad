# cad-ui (THROWAWAY prototype, built in stages)

Started from `in_015`: a clean interface, one stage at a time. It reuses ideas from `kernel-slice` and
`sketch-extrude` (which stay in the repo as reference for the sketch logic, snapping and OCCT worker).
Never import this code from production code (CLAUDE.md rule 9).

**Stage 1 (this version): the 3D view and planes.** Next: sketch on the selected plane, then extrude.

## Run
```bash
bash tools/preview.sh            # from the repo root; default prototype is cad-ui
```
or `cd prototypes/cad-ui && npm install && npm run dev`. Tests: `npm test` (7 tests).

## What it does
- **A dark world with a lit plane.** The world is dark charcoal (`#2b2d30`). A plane is a light paper-gray
  sheet with a dark charcoal grid, like a sheet lit in a dark room. The only color is the world axis lines
  (X red, Y green, Z blue). Press **D** to compare the earlier light "paper" world.
- **World fog:** the plane keeps its own colors and simply fades into the dark world with distance from the
  camera (it does not darken itself). The fall-off is smooth and never ends abruptly. A face-on sketch view is
  a soft spotlight that dims a little toward the edges. **A plane does not fade with viewing angle**: seen at
  a low angle it is a solid plane receding to a horizon, and if you orbit below it you see its underside
  overhead, so the camera visibly passes through it.
- **3D view (nothing selected):** just the world axis lines, each with a flat arrowhead and its letter on
  the positive end (constant on-screen size; hidden when an axis points straight at the camera).
  **Hover** any plane to preview it (a dimmer lit sheet). Click it to make it the sketch plane.
- **Sketch view:** the camera glides to look straight at the plane (standard, un-mirrored views: XY from
  above with X right and Y up, XZ from the front, YZ from the right). Only that plane exists, fully lit, with
  its grid cross-fading between levels as you zoom. Pan (right-drag or Shift-drag) and zoom keep you here.
- **Orbit away** (left drag) and the sketch plane is dropped: you are back in the 3D view and any plane can
  be hovered and clicked again, including the one you just left.
- **Esc** also drops the sketch plane; **H** resets the camera. One status line (a small dark pill) is the
  only text on screen.

## How it works (short)
- `src/viewmath.mjs`: pure math (turntable camera, standard views, ray-plane picking). Unit tested.
- `src/main.js`: three.js view. Each plane is one quad that follows the camera target; a shader draws the
  grid (three levels 10x apart, weights continuous across zoom), the fill, the axis lines and the fog.
  Picking is analytic (ray against the planes; nearest wins; in sketch mode only the sketch plane;
  limited to the fog's far edge). A plane seen edge-on fades out and cannot be picked.
- `src/settings.js`: every threshold, duration, opacity, fog distance and color.

## What we learned (2026-11-04; scripted browser run, headless Chromium)
1. **The flow works end to end**: select, normal view (azimuth -90 degrees, elevation 90 degrees for XY),
   orbit away, click back to normal, switch planes, Esc; zoom from 3 mm to 38 m across with no errors.
2. **Three infinite grids at once got busy** (in dark mode), even at low alpha. `in_018` settled it:
   show only the selected sheet (hover previews in 3D mode), stronger fog, and try a light world. In the
   scripted screenshots the light version reads clearly: blue grid on a pale background, fog fading into
   it. Unselected planes can be brought back as faint sheets in `settings.js` (`grid.base`).
3. **Infinite sheets cannot be hover targets in the usual sense**: every pixel is on some plane, so
   hover always highlights the nearest plane along the cursor's ray. I tried finite sheets (a misreading
   of `in_016`); `in_017` clarified infinite is wanted.
4. **Discoverability cost:** with nothing drawn until you hover, a new user has to know to move the mouse
   over the view; the status line says so. Whether that is fine or needs a cue is your call.
5. **Fog was first built wrong.** My earlier "fog" tinted the plane itself darker toward the distance, which
   read as a dark smudge. `in_022` clarified: world fog. The fix was to make the world the dark color and
   let the plane fade into it, which needed a dark background. The status text then needed its own dark
   pill because it sits over both the dark world and the light sheet.
6. **A leftover fade broke the "infinite plane" illusion** (`in_023`): an early angle-based fade (added to
   stop shimmer) made the plane dissolve as the camera dropped toward it, which read as the plane separating
   and fading away. It was redundant (grid levels already fade by on-screen cell size), so it was removed;
   fog is now distance-only and smooth. Checked at elevations 0.5, 0.2, 0.06, 0 and -0.1 rad, including below
   the plane. At exactly 0 the plane is edge-on and invisible (and cannot be picked), which is geometrically right.
7. **A real bug class**: my first "hover" screenshot looked identical to the no-hover one because the test
   mouse was hovering a plane. Judging visuals needs the cursor state controlled.

## What this does NOT show
- Nobody has used it by hand yet (feel of orbit speed, transition duration, hover, click vs drag
  threshold are all settings in `src/settings.js` waiting for your judgment).
- Perspective camera only; sketching normally wants orthographic. Not tested on touch or in Firefox or
  Safari. No sketching, no geometry, no OCCT in this stage.
