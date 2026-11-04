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
- **Three infinite planes** (XY, XZ, YZ), each a semi-transparent sheet with a **very light gray grid**.
  The grid cross-fades between levels as you zoom, so you can tell you are zooming. The world axis lines
  keep their colors (X red, Y green, Z blue). A small axis gizmo sits in the corner.
- **Fog**: everything fades with distance from the camera, so the far parts of the planes dissolve.
- **Gray or blue**: unselected planes are gray (main grid levels only); the plane under your cursor previews
  **blue**; the selected sketch plane is blue with the full grid.
- **Click a plane**: sketch mode. The camera glides to look straight at it (standard, un-mirrored views:
  XY from above with X right and Y up, XZ from the front, YZ from the right).
- **Orbit freely** (left drag); right-drag or Shift-drag pans; scroll zooms.
- **Click the plane while tilted** to return to its normal view. Clicking a different plane while tilted
  switches to it. When already in a normal view, clicks on the plane are saved for sketching (next stage).
- **Esc** leaves sketch mode; **H** resets the camera. The only text on screen is one status line.

## How it works (short)
- `src/viewmath.mjs`: pure math (turntable camera, standard views, ray-plane picking). Unit tested.
- `src/main.js`: three.js view. Each plane is one quad that follows the camera target; a shader draws the
  grid (three levels 10x apart, weights continuous across zoom), the fill, the axis lines and the fog.
  Picking is analytic (ray against the three planes, nearest wins, limited to the fog's far edge). A plane
  seen edge-on fades out and cannot be picked.
- `src/settings.js`: every threshold, duration, opacity, fog distance and color.

## What we learned (2026-11-04; scripted browser run, headless Chromium)
1. **The flow works end to end**: select, normal view (azimuth -90 degrees, elevation 90 degrees for XY),
   orbit away, click back to normal, switch planes, Esc; zoom from 3 mm to 38 m across with no errors.
2. **Three infinite grids at once get busy.** Feedback `in_016`/`in_017` asked for the grid back on infinite
   sheets, light gray, with fog. What keeps it calm: very low alpha on unselected planes, no fine grid
   level on them, fog starting at about one view-distance, and edge-on planes fading out. Judge by eye;
   all of it is in `settings.js`.
3. **Infinite sheets cannot be hover targets in the usual sense**: every pixel is on some plane, so
   hover always highlights the nearest plane along the cursor's ray. I tried finite sheets (a misreading
   of `in_016`); `in_017` clarified infinite is wanted.
4. **A real bug class**: my first "hover" screenshot looked identical to the no-hover one because the test
   mouse was hovering a plane. Judging visuals needs the cursor state controlled.

## What this does NOT show
- Nobody has used it by hand yet (feel of orbit speed, transition duration, hover, click vs drag
  threshold are all settings in `src/settings.js` waiting for your judgment).
- Perspective camera only; sketching normally wants orthographic. Not tested on touch or in Firefox or
  Safari. No sketching, no geometry, no OCCT in this stage.
