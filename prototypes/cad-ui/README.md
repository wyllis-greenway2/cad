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
- **Light world** in a paper-like cream gray, with a dusty teal-blue for the selected plane (a "dark" theme exists too; press **D** to flip between them while you compare).
- **3D mode (nothing selected):** just the world axis lines (X red, Y green, Z blue). The axis
  indicators are built into those lines: a flat arrowhead and a letter on the positive end of each,
  constant on-screen size, hidden when an axis points straight at the camera. No corner gizmo. **Hover** and the plane under the cursor appears as an infinite blue sheet with a light grid.
  Move off it and it disappears. Unselected planes are never shown.
- **Click a plane:** it becomes the sketch plane. The camera glides to look straight at it, and that plane
  is drawn with a **charcoal gray grid** on a dusty-teal sheet (full grid that cross-fades between levels as
  you zoom). Standard, un-mirrored views: XY from above (X right, Y up), XZ from the front, YZ from the right.
- **Two modes, decided by where you look:** looking straight at the sketch plane is the **sketch view** (only
  that plane exists, so nothing else can be hovered or clicked). Orbit away and you are in the **3D view**:
  hover any plane to preview it, click it to make it the sketch plane, or click the current sketch plane to
  return to its normal view.
- **Orbit freely** (left drag); right-drag or Shift-drag pans; scroll zooms.
- **Esc** drops the sketch plane entirely (back to the empty 3D view where all planes can be hovered); **H**
  resets the camera. One status line is the only text on screen.

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
5. **A real bug class**: my first "hover" screenshot looked identical to the no-hover one because the test
   mouse was hovering a plane. Judging visuals needs the cursor state controlled.

## What this does NOT show
- Nobody has used it by hand yet (feel of orbit speed, transition duration, hover, click vs drag
  threshold are all settings in `src/settings.js` waiting for your judgment).
- Perspective camera only; sketching normally wants orthographic. Not tested on touch or in Firefox or
  Safari. No sketching, no geometry, no OCCT in this stage.
