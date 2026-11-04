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
- A 3D view with the **XY, XZ and YZ planes drawn as infinite grids** (colored axis lines: X red, Y green,
  Z blue), a small axis gizmo in the corner, and almost no other chrome.
- **Click a plane** (or use the XY / XZ / YZ buttons): it becomes the sketch plane and the camera glides
  to look straight at it. The views are the standard, un-mirrored ones: XY from above (X right, Y up),
  XZ from the front (X right, Z up), YZ from the right (Y right, Z up).
- **Orbit freely** with a left drag; right-drag or Shift-drag pans; scroll zooms.
- **Click the plane while tilted** to return to its normal view. When already normal, that click is saved
  for sketching in the next stage.
- Hovering a plane brightens it; once a plane is selected the other two dim so they don't compete.
  **Esc** deselects, **H** or the Home button returns to the 3D overview.

## How it works (short)
- `src/viewmath.mjs`: pure math (turntable camera, standard views, ray-plane picking). Unit tested.
- `src/main.js`: three.js view. Each plane is one quad that follows the camera target, with the grid
  computed in a shader from world coordinates: three grid levels 10x apart that cross-fade as you zoom,
  and a distance fade so it reads as infinite. Picking is analytic (ray against the three planes), and a
  plane seen edge-on or beyond the visible grid cannot be picked.
- `src/settings.js`: every threshold, duration, opacity and color.

## What we learned (2026-11-04; scripted browser run, headless Chromium)
1. **The flow works end to end**: select XY from the 3D view, camera ends at the exact normal view
   (azimuth -90 degrees, elevation 90 degrees), orbit away, click the plane, back to normal; XZ and YZ the
   same from the overview.
2. **Three infinite grids at once are visually heavy.** The first version looked like being inside a
   wire box. Fixes that helped: fade the grid out close to the target (soft edge), make the finest level
   faint, very light fills, and dim the non-selected planes. Judge whether it is calm enough.
3. **Picking has one inherent ambiguity**: from the overview every pixel hits some plane, so a click
   anywhere selects the nearest one along that ray. That is simple and predictable, but you may want
   plane handles or labels instead. Selection buttons exist as a fallback and can be removed.
4. **The grid looks the same from 3 mm to 38 m across** (zoom clamps at 0.5 mm and 50 m).

## What this does NOT show
- Nobody has used it by hand yet (feel of orbit speed, transition duration, hover, click vs drag
  threshold are all settings in `src/settings.js` waiting for your judgment).
- Perspective camera only; sketching normally wants orthographic. Not tested on touch or in Firefox or
  Safari. No sketching, no geometry, no OCCT in this stage.
