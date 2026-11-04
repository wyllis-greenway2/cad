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
**Look.** A dark world with lit sheets. Each sheet has four independent controls (all in `settings.themes.world.states`,
separately for the selected plane and the hovered plane,):
- **brightness**: how much light the sheet gives off. It is screen-blended, so it brightens what is behind the sheet without
  clipping it to white: a bright sheet can still be see-through.
- **opacity**: how much the sheet hides what is behind it, using the sheet color. 0 = fully see-through, 1 = solid. It does not
  change the brightness.
- **grid line opacity** and **fine grid level**.
And two separate falloffs: the **backlight area** (`settings.sheetArea`: how far a sheet's light, grid and the axis lines reach from
where you look) and the **world fog** (`settings.fog`: objects in the scene fade into the dark world with distance, so the fog is
*behind* the sheet and not only on it). The only color is the world axes (X red, Y green, Z blue) with arrowheads and letters.

**Mouse** (all remappable in `settings.input`; the left button is always the tool, never navigation)
- Right-drag orbit, middle-drag pan (also Shift + right-drag), wheel zoom (**in** toward the point under the cursor, **out**
  about the view center, so zooming out can never fling the view away), Ctrl + wheel (trackpad pinch) zoom. **Alt + left-drag also orbits** (trackpads, mice without a usable right button), and
  **plain left-drag orbits whenever the left button has nothing else to do** (in the 3D view, and on empty space with the
  select tool). Presets: `ours` (default), `fusion`, `solidworks`, `blender` (set `input.navPreset`).
- **Right-click without dragging** opens a small menu (tools, undo/redo, home, back to 3D view). No toolbar anywhere.
- **Getting out of a sketch** (it must never feel locked): press **Esc** (steps back, and from the select tool it glides
  the camera back to the 3D view you came from), click the small **3D view** button in the status line, pick "Back to 3D
  view" in the right-click menu, press **H**, or orbit away by any of the gestures above.

**Getting lost**: panning and zooming into a spot can take you far from the origin, where the axes fog out. When the origin is lost
(fogged out, or far and off screen) a small **"Origin is far away: return (O)"** button appears by the status line. **O**, that button, or
"Return to origin" in the right-click menu glides the view back to the origin, keeping your viewing direction (a sketch stays face-on) and
bringing the view distance into a sensible range. **H** still resets the whole camera.

**Keys** (all remappable in `settings.input.keys`)
- **V** select, **L** line (polyline), **R** rectangle, **C** circle, **H** home view, **O** return to origin. **O** return to the origin. Hover a plane in the 3D view and press
  R, L or C to start sketching on it with that tool. **D** dimension and **E** extrude work in the sketch view (below).
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
checked). **Tuned again (`in_031`):** world #242424, sheet #f3f0e7, brightness 1.2 and opacity 0.5 (selected and hovered), grid lines 0.5, fine level 0.5, and
the world fog 0.5 to 2.5; all other values unchanged (37 values checked against the file).

**Changes since:** the sheet is no longer one opaque fill (`in_028`, `in_030`). Your tuned fill numbers (hover 0.75, selected
1.0) became **brightness** (re-set to 0.62 and 0.6) and **opacity** (0), independent of each other; and the fog you tuned
(near 0.5, far 2.5, sharpness 2.5, axis 2.5) now drives the sheet's **backlight area**, while a new **world fog** (0.9 to 3.5)
fades objects. The temporary tuning panel and the reflective-sheet experiment were removed (`in_033`); git history has both.


## Look changes (`in_035`)
Plane view is orthographic; leaving it shows the hovered plane straight away. Sketch lines are thin (dark core, light halo); closed shapes are
cream faces; a hovered or selected plane leans slightly blue (`states.*.blue`, `themes.world.blue*`). World view option `settings.backdrop`:
the plane is almost see-through and the cream sheet sits behind it (drawn first, never covers an object); `enabled: false` = the older look.

## Selecting, faces, color and light (`in_036`, `in_037`)
**Click selects; it never moves the camera.** In the 3D view you can select a plane, a flat axis-facing face of a body, or a closed sketch shape that
is not extruded yet (hover tints it blue; a body face wins over the see-through planes). With something selected, act on it: **E** extrudes a face
or a closed shape (drag or type a distance: out adds, in cuts; a body face is pushed or pulled), **S** or a sketch key (**R**, **C**, **L**) sketches on
it (this is the only thing that goes orthographic and face-on), Esc deselects. No more "E, then pick, then pull". Pointing at something without selecting
also works for the key, and the right-click menu offers both. The face plane a sketch uses is a frozen copy of the face (it does not follow the face if
you later change an earlier step); a pushed or pulled face is found again by its position, so it can fail ("face not found") if earlier steps move it.
Look: objects and faces are one light bone color (`themes.world.bodyColor`), the sheet a slightly darker one; bodies are solid, unextruded closed shapes are
semi-transparent faces (`settings.sketch.regionFill`); sketch lines are thin and black (`lineWidthPx`, no halo). A light rides with the camera plus a
fill, the body has a clear-coat sheen and a soft studio reflection (`settings.light`: `sheen`, `reflect`, `roughness`, `key`, `fill`). Axis lines and arrows
behind an object show only faintly (`grid.axisGhost`, `axisArrow.faintOpacity`).

## Modify (`in_038`)
Single click selects a **corner**, **line** (within a few pixels), **face**, unextruded **sketch shape** or **plane**; **double-click selects the whole body**.
Body selected: **M** move, **T** rotate, **K** scale (X / Y / Z picks the axis, drag or type a number, Enter applies; rotate and scale are about the body's box
centre; each is a step in the History list you can click to change). Face selected: **E** push/pull, **S** sketch from this face. Lines and corners are only
selectable so far. The last plane that was showing keeps showing when nothing is selected or pointed at. Rotating a body by an angle that is not a multiple of 90°
makes its faces non-axis-aligned, and those cannot be selected or sketched on yet.

## Dimension tool (D)
Point at a shape (its dimensions appear), click it to keep them showing. Type a number (math works, `50/2`), Tab to the next
dimension, Enter to apply; or click a number to edit that one. Esc cancels, then deselects, then leaves the tool. One undo step per Enter.
No stored constraints yet (`q_constraint_solver` is open): it resizes the shape directly, keeping a rectangle's first corner, a circle's
centre and the start of a polyline segment fixed. Look values: `settings.sketch.dim*`.

## Extrude (E)
Press **E**, click inside a closed shape. The view tilts to 3D and a yellow arrow shows the pull. Drag anywhere (hold Shift for fine steps) or just
type a distance (math works). **Positive adds, negative cuts** (when a body exists; otherwise it adds the other way). Enter applies, Esc cancels.
The exact solid comes from OCCT (`src/worker.js`, `src/interpreter.mjs`, copied from `sketch-extrude`; `src/body.js` shows it); until it arrives a
translucent green (add) or red (cut) prism shows. **History (n)** (top left) lists the extrusions: click one to change its distance, Delete removes it.
Ctrl+Z / Ctrl+Y undo and redo them with sketch edits. Limits: only the three base planes can be sketched on (not body faces yet), and an extrusion
keeps a copy of its shape (editing the sketch later does not change it). Look values: `settings.extrude`, `themes.world.body*`.

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
