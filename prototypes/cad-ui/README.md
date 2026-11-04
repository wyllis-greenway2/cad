# cad-ui (THROWAWAY prototype, built in stages)

Started from `in_015`: a clean interface, one stage at a time. It reuses ideas from `kernel-slice` and
`sketch-extrude` (which stay in the repo as reference for the sketch logic, snapping and OCCT worker).
Never import this code from production code (CLAUDE.md rule 9).

**Stage 1 (this version): the 3D view and planes.** Next: sketch on the selected plane, then extrude.

## Run
```bash
bash tools/preview.sh            # from the repo root; default prototype is cad-ui
```
or `cd prototypes/cad-ui && npm install && npm run dev`. Tests: `npm test` (20 tests: view math, keymap and navigation presets, typed-size math, sketch store with undo/redo, drawing session). A scripted browser run (27 checks) also covers the full workflow; it is not part of the repo because it needs Playwright.

## What it does (stage 2: sketching on the plane)
**Look.** A dark world with a backlit plane. A plane is a see-through sheet of light (it is *added* to whatever is behind
it, so objects behind a sheet stay visible) with charcoal grid lines; with distance the light fades into the dark world
(that is the fog). The only color is the world axes (X red, Y green, Z blue) with arrowheads and letters on the lines.

**Mouse** (all remappable in `settings.input`; the left button is always the tool, never navigation)
- Right-drag orbit, middle-drag pan (also Shift + right-drag), wheel zoom toward the point under the cursor,
  Ctrl + wheel (trackpad pinch) zoom. **Alt + left-drag also orbits** (trackpads, mice without a usable right button), and
  **plain left-drag orbits whenever the left button has nothing else to do** (in the 3D view, and on empty space with the
  select tool). Presets: `ours` (default), `fusion`, `solidworks`, `blender` (set `input.navPreset`).
- **Right-click without dragging** opens a small menu (tools, undo/redo, home, back to 3D view). No toolbar anywhere.
- **Getting out of a sketch** (it must never feel locked): press **Esc** (steps back, and from the select tool it glides
  the camera back to the 3D view you came from), click the small **3D view** button in the status line, pick "Back to 3D
  view" in the right-click menu, press **H**, or orbit away by any of the gestures above.

**Keys** (all remappable in `settings.input.keys`)
- **V** select, **L** line (polyline), **R** rectangle, **C** circle, **H** home view. Hover a plane in the 3D view and press
  R, L or C to start sketching on it with that tool. **E** extrude and **D** dimension are reserved (next stages).
- **Esc** steps back one level: stop typing, then cancel the shape, then leave the tool, then clear the selection, then
  leave the sketch. **Enter** applies. **Delete** removes the selected shape. **Ctrl/Cmd+Z** undo,
  **Ctrl/Cmd+Shift+Z** or **Ctrl+Y** redo (undo covers drawing and deleting shapes, not camera moves).

**Drawing** on the selected plane (face-on): click, or press-drag for rectangles and circles.
Snapping to corners, midpoints, centers and the origin within 12 screen pixels, with horizontal/vertical inference lines
(hold Shift for no snapping). A marker shows every placed point, the status line says what to do next, and closed shapes get a
light fill (the regions to extrude later). Shapes stay on their plane when you leave the sketch.

**Type a number.** While a shape is in progress, just start typing: a small field appears by the cursor.
Rectangle: width, **Tab**, height. Circle: diameter. Line: length, **Tab**, angle (degrees). Math works (`80/2`, `3*4+1`),
**Enter** commits (the direction comes from where the cursor is), **Esc** stops typing.

## Look values (tuned by the human, `in_025`) and the tuning panel
The colors, fog, grid and arrow values in `src/settings.js` were tuned by hand and applied exactly (68 numbers
checked). **One change since:** the sheet is now a see-through backlight instead of an opaque fill (`in_028`), so the
two tuned sheet "fill" numbers (hover 0.75, selected 1.0) now mean light strength and were re-set to 0.62 and 0.6 so
objects behind a sheet stay visible. `bash tools/preview.sh tune` brings back the temporary tuning panel (`?tune`) to
set them (and the rest) exactly. The panel has its own buttons (3D view, Sketch XY/XZ/YZ, a pinned hover sheet, test
boxes), so the look can be tuned with no mouse navigation at all. Send the values back and the panel is removed again.

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
