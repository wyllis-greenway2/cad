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
- **3D mode (nothing selected):** an empty dark view with only the colored axis lines (X red, Y green,
  Z blue) and a small axis gizmo. **Hover near the origin** and the plane under the cursor shows as a
  semi-transparent sheet with an outline and a small "XY plane: click to sketch" tag. Move away and it
  disappears. The sheet is a finite square around the origin (so you can hover it or miss it); its size
  scales with zoom.
- **Click a sheet** (or use the XY / XZ / YZ buttons): sketch mode starts. The camera glides to look
  straight at that plane and **the grid appears, on that plane only**. Views are the standard, un-mirrored
  ones: XY from above (X right, Y up), XZ from the front (X right, Z up), YZ from the right (Y right, Z up).
- **Orbit freely** with a left drag; right-drag or Shift-drag pans; scroll zooms.
- **Click the plane while tilted** to return to its normal view. When already normal, that click is saved
  for sketching in the next stage. In sketch mode only the sketch plane can be clicked (it is infinite).
- **Esc** leaves sketch mode (back to the empty 3D mode); **H** or Home also resets the camera.

## How it works (short)
- `src/viewmath.mjs`: pure math (turntable camera, standard views, ray-plane picking). Unit tested.
- `src/main.js`: three.js view. Each plane is one quad that follows the camera target; a shader draws the
  axis lines, the hover sheet (a square around the origin) and, in sketch mode, the grid: three levels 10x
  apart that cross-fade as you zoom, with a distance fade so it reads as infinite. Picking is analytic
  (ray against the planes): finite sheets in 3D mode, the one infinite sketch plane in sketch mode.
  A plane seen edge-on cannot be picked.
- `src/settings.js`: every threshold, duration, opacity and color.

## What we learned (2026-11-04; scripted browser run, headless Chromium)
1. **The flow works end to end**: select XY from the 3D view, camera ends at the exact normal view
   (azimuth -90 degrees, elevation 90 degrees), orbit away, click the plane, back to normal; XZ and YZ the
   same from the overview.
2. **Three infinite grids at once were visually heavy** (like being inside a wire box). Feedback (`in_016`):
   grid only in sketch mode, and in 3D only a hover sheet. Done. Nothing but axes is drawn in 3D mode.
3. **Infinite sheets cannot be hover targets.** My first try washed the whole screen in one color,
   because every pixel lies on some infinite plane. Sheets are therefore finite squares around the origin.
   Open question for you: are finite sheets right, or would you rather have faint outlines of all three
   always visible so you can see where to hover? (One-line change in the shader.) The XY / XZ / YZ buttons
   are a fallback and can be removed.
4. **The grid looks the same from 3 mm to 38 m across** (zoom clamps at 0.5 mm and 50 m).

## What this does NOT show
- Nobody has used it by hand yet (feel of orbit speed, transition duration, hover, click vs drag
  threshold are all settings in `src/settings.js` waiting for your judgment).
- Perspective camera only; sketching normally wants orthographic. Not tested on touch or in Firefox or
  Safari. No sketching, no geometry, no OCCT in this stage.
