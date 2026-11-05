# Handoff log

Append-only. One entry per session. A new session reads the last entry first.

## Handoff 001 — 2026-11-04
**State:** Repo was empty at session start. Design discussion happened (see `docs/human-input.md`), and
the project record was set up: `CLAUDE.md`, `docs/decisions/`, `docs/human-input.md`, `docs/origin/`,
`tools/check_docs.py` (+ CI workflow). The human's original blueprint is preserved untouched in
`docs/origin/`.

**Accepted by the human:** web-first with a portable core (`dec_platform_web_portable`), the human-input
record (`dec_human_input_log`), a lean version of the Mosaic method (`dec_lean_project_structure`).

**Not yet decided (open questions in `docs/decisions/`):** geometry kernel (OCCT vs custom vs hybrid),
the role of the grid, how geometry references stay stable, which constraint solver. The AI gave
recommendations on these; the human has not approved any of them.

**Next:** (1) create `docs/licenses.md` (the human asked for this in `in_007`); (2) human decides
`q_kernel_choice`; (3) vertical-slice spike with a test corpus; (4) revised blueprint.

**Notes for next session:** commits so far are authored under the Claude identity in this
environment. Ask the human whether they want to commit under their own identity as well.

## Handoff 002 — 2026-11-04
**State:** Wrote `docs/licenses.md` and `tools/license_scan.mjs`. Built `prototypes/kernel-slice` (approved
in `in_012`): JSON graph to OCCT (replicad WASM) in a Web Worker with a Three.js view, 10 passing tests,
a 19-case corpus (`corpus-results.md`) and a history-based reference experiment. Findings are in that
README and were added to `q_kernel_choice`, `q_topological_refs` and `q_grid_role` as evidence. All three
stay open: nothing was decided. Rule 9 was loosened in `in_011` (`dec_prototyping_policy`).

**Not done / blocked:** pushing. GitHub returned 403 (the Claude GitHub App needs access to
`wyllis-greenway2/cad`); every commit so far is local to this session's container until that is fixed.

**Next:** the human reviews the findings and answers `q_kernel_choice`; then pick the next prototype.

## Handoff 003 — 2026-11-04
**State:** Built `prototypes/sketch-extrude` (approved in `in_013`): rectangle, circle and polyline tools with
snapping and inference lines, closed-region highlight, tilt to 3D, drag-the-arrow or typed extrude with an
instant ghost plus exact OCCT preview, cut by pulling below the plane, sketch on the top face, undo,
live JSON graph. 9 passing tests plus a scripted end-to-end run in headless Chromium (volumes matched
closed forms; drag round trips about 20 to 30 ms). `tools/preview.sh` now takes a prototype name and
defaults to `sketch-extrude`. Evidence added to `q_grid_role`. No open question was decided.

**First human report (`in_014`):** "I click R and click and nothing happens". Not reproducible as a logic
bug; the visual feedback was too weak. Fixed in a follow-up commit (fat lines, start-point marker, prompts,
press-and-drag, ignored-click message, cursor/click readout). Waiting to hear whether it now works for the
human; if not, ask for browser, OS, and what the sidebar cursor line shows.

**Not verified:** feel with a real hand, trackpad or touch; browsers other than headless Chromium.

**Next:** the human tries it and reports what feels right, wrong or missing. Likely candidates after that:
pick a face to sketch on (real face picking), constraints and dimensions, fillet handles, or deciding
`q_kernel_choice`.

## Handoff 004 — 2026-11-04
**State:** After hands-on use, the human reset the interface work (`in_015`): start clean, in stages (planes
and navigation, then sketch on a plane, then extrude). Built stage 1 as `prototypes/cad-ui`: a 3D view with
infinite XYZ plane grids (shader), click-to-select with an animated move to the plane's normal view,
free orbit, click-the-plane-to-return, dimming of non-selected planes, axis gizmo. 7 unit tests on the
view math plus a scripted browser run (select, orbit, return, XZ/YZ, zoom extremes) all passed. The
earlier `sketch-extrude` drawing feedback fixes were pushed before this (`in_014`). `tools/preview.sh`
now defaults to `cad-ui`. Two human-origin decisions recorded: `dec_ui_plane_selection`,
`dec_ui_build_order`.

**AI choices in stage 1 that the human has not reviewed:** standard un-mirrored views per plane; clicking
the selected plane while tilted returns to normal (and does nothing yet when already normal); other planes
dim when one is selected; perspective camera; plane buttons as a fallback to clicking.

**Next:** human tries stage 1 and gives feedback. Then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 005 — 2026-11-04
**State:** Feedback on `cad-ui` stage 1 (`in_016`): the grid was hard to see; wanted no grid in 3D mode
(grid only in sketch mode) and semi-transparent hover sheets to select planes; also reported needing to run
`tools/preview.sh` twice. Done: 3D mode now shows only axis lines; hovering shows a finite outlined sheet
with a tag; sketch mode shows the grid on the selected plane only; Esc leaves sketch mode. My first
attempt (infinite hover sheet) washed the whole screen one color, so sheets are finite squares. 9 view-math
tests plus a scripted browser run passed. `tools/preview.sh` now re-runs itself after `git pull` (the old
copy kept running after a pull that changed it, which is the likely cause of the double run), prints the
commit it is running, and refuses to start if port 5173 is busy.

**Open for the human:** finite hover sheets vs faint outlines always visible; whether the XYZ buttons stay.
**Next:** human tries it; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 006 — 2026-11-04
**State:** Feedback `in_017` on `cad-ui`: drop the XYZ buttons and reduce clutter; the sheets should be
infinite (the finite hover sheets in Handoff 005 were a misreading); put a very light gray grid back on
the sheets; add distance fog; things are gray, or blue when selected; keep the colored world axes. Done:
toolbar, hint box and tag removed (one status line left); infinite sheets with grid; fog by camera
distance; gray/blue states (hover previews blue); grid zoom levels cross-fade; clicking another plane
while tilted switches. 7 view-math tests plus a scripted browser run (hover, select, tilt, switch, return,
Esc, zoom) passed. `dec_ui_plane_selection` updated to the human's current wording.

**Open for the human:** whether the overview with three faint grids is calm enough; hover = blue preview
is my reading of "blue when selected".
**Next:** human tries it; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 007 — 2026-11-04
**State:** Feedback `in_018` on `cad-ui`: stronger fog; show only the selected sheet; try a light world.
Done: fog nearer (starts 0.9 view-distances, gone by 2.4; was 1.05 and 3.2); unselected planes hidden (hover
previews the plane in 3D mode; in sketch mode only the sketch plane exists and is the only pickable one,
so Esc is needed to switch); light theme is the default, **D** toggles dark. 8 view-math tests plus a
scripted browser run passed (overview, hover, select, tilt, sketch-mode picking, dark toggle).
`dec_ui_plane_selection` updated.

**Open for the human:** is hover-only discovery OK (nothing drawn until you hover)? Light vs dark? Fog
strength (settings `fog.*`)?
**Next:** human tries it; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 008 — 2026-11-04
**State:** Visual refinements `in_019` on `cad-ui`: paper cream-gray background (#eeece6), dusty teal blue
(selected plane), darker and more defined grid lines (and each grid level fades out when its cells get under
7 px, which removed a moire pattern), XYZ indicators moved onto the world axis lines as flat arrowheads with
letters (corner gizmo removed), and fog that tints darker with distance (then dissolves far out). 8 view-math
tests plus a scripted browser run passed; checked screenshots of overview, hover, sketch, tilted and dark.

**AI choices not yet reviewed:** exact colors, haze strength (`fog.hazeMax`), arrow size and distance along
each axis (`axisArrow.*`); arrows hide when an axis points at the camera.
**Next:** human tries it; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 009 — 2026-11-04
**State:** `in_020` on `cad-ui`: charcoal gray grid lines (light charcoal #565c60-ish), darker charcoal fog,
and "when you go back into 3D mode you can select any plane again". My reading: 3D mode = view is not
face-on to the sketch plane. Picking is locked to the sketch plane only while looking straight at it; when
tilted, any plane can be hovered (preview) and clicked (becomes the sketch plane); Esc still drops the sketch
plane. Verified by a scripted run: face-on picks only XY; tilted picks XZ/YZ/XY; clicking YZ then XZ switches;
Esc plus H makes all three pickable. 8 view-math tests passed.

**Open for the human:** did I read "3D mode" right (orbiting away from the sketch view)? The old status text
no longer mentions Esc-then-click as the only way to switch planes.
**Next:** human tries it; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 010 — 2026-11-04
**State:** `in_021` on `cad-ui`: un-select the sketch plane when going back into 3D mode (orbiting away from
the face-on view drops it; pan and zoom do not; Esc also drops it); darker charcoal grid; no blue anywhere
(sheet and lines are charcoal, only the world axis colors remain); much darker charcoal fog. The "tilted but
still selected" state from Handoff 009 no longer exists. Verified by a scripted run: select XY, pan and zoom
keep it, orbit away drops it, hover and click YZ selects it, clicking the plane just left reselects it, no
errors. 8 view-math tests passed.

**Known visual caveat:** very dark haze on a steeply viewed plane shows as a dark band with a lighter gap
beyond it (the plane fades at the horizon). Alternatives recorded in the README.
**Open for the human:** is the fog now right, or should it be milder / a screen-space gradient?
**Next:** more UI-foundation polish if wanted; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 011 — 2026-11-04
**State:** `in_022` on `cad-ui`: the fog must be world fog, not darkening the planes; "the whole world is dark but a
light is shining on the plane". Done: the world (background) is dark charcoal #2b2d30; the plane is a light
paper-gray sheet with dark charcoal grid lines that fades (alpha) into the world with distance from the
camera (the earlier haze that darkened the plane was removed); hover shows a dimmer lit sheet, the sketch
plane is fully lit; subtle spotlight vignette in the face-on view; the status text got a dark pill so it reads
on both; axis letters got a dark halo. The previous light world remains as the "paper" theme (press D).
8 view-math tests plus a scripted run (select, pan/zoom, orbit away, hover, reselect, theme toggle) passed
with no errors; checked screenshots.

**Open for the human:** is this the "world fog / lit plane" you meant? The face-on view is nearly an
edge-to-edge light sheet with only a mild vignette (fog.nearFactor).
**Next:** UI polish as wanted, then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 012 — 2026-11-04
**State:** `in_023` on `cad-ui` (the human sent a low-angle screenshot): at low angles the plane looked like it
separated and faded away instead of the camera passing through it. Cause: a grazing-angle alpha fade in the plane
shader (added early against shimmer; redundant since grid levels fade by on-screen cell size) plus a fog that
ended in a smooth-step cutoff. Fixed: removed the angle fade entirely; fog is now an exponential-style smooth
fall-off with no hard end (`fog.nearFactor`, `farFactor`, `sharpness`). Verified in screenshots at elevations
0.5, 0.2, 0.06, 0 and -0.1 rad: the floor stays solid and meets a dark horizon; below the plane its underside is a
ceiling overhead. 8 view-math tests passed, no console errors. Added a `__ui.setView` test hook.

**Open for the human:** is the horizon/fog now the "camera goes through the plane" feel you meant? Edge-on
(elevation exactly 0) the plane is a line and cannot be picked.
**Next:** more UI polish if wanted; then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 013 — 2026-11-04
**State:** The human said the look is "pretty good" and asked (`in_024`) for a temporary version with knobs so they
can hand back exact values. Built `src/tune.js`, loaded only with `?tune` (`bash tools/preview.sh tune`): live
controls for theme colors (picker, hex and lightness slider each), selected and hover opacities, world fog, grid
and axis line settings, arrow and letter placement, and view settings; an exact-values box with Copy; localStorage
persistence; Reset; K hides it; the 3D view sits beside it. To make everything live, the shader parameters are now
set every frame from `settings` (they were set once at creation) and the pick distance follows the fog's far edge.
Typing in the panel no longer triggers view shortcuts. Verified by a scripted run (panel absent without `?tune`,
edits apply, output reflects them, survives reload, reset, K hides) with no console errors; 8 tests pass.

**Open for the human:** tune, then send the exact values (the text box, or a screenshot of it). Both themes are in
the output.
**Next:** apply the values to `settings.js`, delete `tune.js`, then stage 2 (sketch on the plane), stage 3 (extrude).

## Handoff 014 — 2026-11-04
**State:** The human tuned the look with the temporary panel and pasted the values back (`in_025`). Applied
verbatim to `prototypes/cad-ui/src/settings.js` and verified by a script comparing every pasted number (68) to the
file: exact match. Notable changes from my defaults: the world color is near black (#121212), the sheet is a warm
cream gray (#eae3dc), selected sheet fully opaque with grid lines at 0.49, hover sheet 0.75, fog starts at 0.5 and is
almost gone at 2.5 (sharpness 2.5; axis lines reach 2.5), grid density 8, minimum cell 4 px, arrows a bit longer on
the line (0.83) with a wider letter gap (13). The paper theme was left as-is. The tuning panel (`src/tune.js`) and the
`tune` launcher shortcut were removed as promised; they remain in git history (commit `d86a2b4`). 8 tests pass and
the full interaction flow (select, pan/zoom, orbit away, reselect) passes with the applied look.

**Next:** stage 2 (sketch on the plane), then stage 3 (extrude). The sketch tools, snapping and OCCT worker from
`prototypes/sketch-extrude` are the reuse candidates; the human's interface rules (`dec_ui_plane_selection`) apply.

## Handoff 015 — 2026-11-04
**State:** The human approved the conventions as a starting point (`in_028`; recorded as `dec_ui_conventions`, the
question `q_ui_conventions` was removed): they drove Shapr3D with a mouse, want less always on screen (drawer,
right-click, hotkeys), like Shapr3D's extrude defaults (positive adds, negative cuts), and asked for lighter, brighter,
still-transparent sheets with a back light. Built stage 2 in `prototypes/cad-ui`:
- **Sheets:** two passes per plane: a screen-blended backlight (see-through; objects behind stay visible, verified with a
  test box) and the grid/axis lines. The paper theme and the D theme toggle were removed (D means dimension).
- **Input:** data-driven keymap and navigation presets (`settings.input`): right-drag orbit, middle-drag pan, wheel zoom
  toward the plane point under the cursor (a bug where the target was overwritten before use was caught by the tests),
  presets for Fusion, SolidWorks and Blender; right-click menu; hotkeys V/L/R/C/H, Esc as a stepwise back, Enter,
  Delete, Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y; hover a plane and press R/L/C to start sketching on it.
- **Sketching:** rectangle, circle, polyline on any plane; snapping and inference; clear feedback; shapes persist on their
  plane in 3D; select by edge or inside; delete; undo/redo through a sketch store (command history).
- **Typing:** a field next to the cursor; rectangle W/Tab/H, circle diameter, line length/Tab/angle; safe math; direction
  from the cursor.
- 20 unit tests plus a scripted browser run of the whole workflow (27 checks) all pass; no console errors.
- The temporary tuning panel is back (`bash tools/preview.sh tune`) for the new sheet brightness.

**Important for the human:** their tuned sheet "fill" values (hover 0.75, selected 1.0) meant opacity before; they now mean
backlight strength, so the AI reset them to 0.62 and 0.6. Tune them with the panel.
**Not built yet:** extrude, the history list, the drawer, the dimension tool, constraints, trackpad orbit gestures.
**Next:** the human tries stage 2 and reports; then stage 3 (extrude with Shapr3D-style defaults).

## Handoff 016 — 2026-11-04
**State:** Bug report `in_029`: after clicking a sheet the human got "locked" on it and could not get back to the 3D view,
which also blocked tuning the sheet look. Likely causes, all fixed in `prototypes/cad-ui`:
1. Esc dropped the sketch plane but left the camera face-on, so nothing visibly changed. Now Esc (from the select tool), the
   menu entry "Back to 3D view" and a new **3D view** button in the status line glide the camera back to the pose it
   came from (or the default oblique view if that was already face-on).
2. The status line had lost its exit hint in stage 2; the button restores it.
3. Orbit had moved to right-drag only. Plain left-drag now orbits when the left button has nothing else to do (3D view; select
   tool on empty space), and Alt + left-drag orbits (Shift+Alt+left-drag pans), so a trackpad or a mouse without a usable
   right button is never trapped.
4. On the tuning page, keys were ignored while a panel slider had focus; sliders, colors and buttons now release the keyboard.
The tuning panel gained its own buttons (3D view, Sketch XY/XZ/YZ, Pin hover sheet, Test boxes) so the look can be tuned
without mouse navigation. 21 unit tests plus scripted browser runs (the lock-in scenarios: 12 checks, and the earlier stage 2
workflow: 27 checks) all pass. `dec_ui_conventions` records the correction.

**Open for the human:** do the new exits feel right (Esc glide, the button, left-drag orbit)? Then tune the sheet look with
`bash tools/preview.sh tune` and send the values.
**Next:** stage 3 (extrude with Shapr3D-style defaults, history list, drawer).

## Handoff 017 — 2026-11-04
**State:** `in_030`: the human could not tune sheet brightness separately from transparency, and the fog was only on the sheet,
not behind it. Rebuilt the sheet as three passes in `prototypes/cad-ui`: a paint layer (**opacity**, sheet color), a glow layer
(**brightness**, screen-blended so it does not clip what is behind it to white; my first additive version made a bright sheet
turn a box behind it pure white, which was caught by looking at the screenshot), and the grid and axis lines. The fog is split in two:
**sheetArea** (backlight area: how far a sheet's light, grid and axes reach; carries the values the human tuned) and **fog** (world
fog: a real scene fog on objects, 0.9 to 3.5 view distances). The tuning panel now has Brightness, Opacity, Backlight area and
World fog sections, plus a "Pinned look" toggle so the selected look can be viewed in the 3D view with test boxes. Verified with
screenshots (bright and see-through; bright and veiled; objects fading in fog), 20 unit tests, and the lock-in (12) and stage 2 (27)
scripted checks, all passing.

**Open for the human:** tune brightness and opacity (selected and hovered) and the two falloffs with `bash tools/preview.sh tune`
and send the values.
**Next:** apply the human's values and remove the panel; then stage 3 (extrude).

## Handoff 018 — 2026-11-04
**State:** `in_031` (with a screenshot): the human tuned the look and sent the values (applied verbatim; 37 values checked: world #242424,
sheet #f3f0e7, brightness 1.2, opacity 0.5, grid line 0.5, fine 0.5 for both selected and hovered; world fog 0.5 to 2.5; everything else
unchanged), asked for slightly reflective sheets, and reported getting the view "covered in fog" after zooming and panning.
- **Lost origin.** Reproduced: zoom-to-cursor and panning moved the target 430 mm from the origin in a few moves, far past where the axes fog
  out. Root cause beyond plain panning: zooming OUT anchored on the cursor point multiplies the offset (a 50x zoom-out moved the target ~50x
  away). Fixed: zoom in toward the cursor, zoom out about the view center; anchor only on plane points within 1.5 view-distances of the
  target; a small "Origin is far away: return (O)" button appears when the origin is lost (fog strength below 0.3, or off screen and over
  1 view-distance away); **O** and a "Return to origin" menu item glide the target back to the origin keeping the viewing direction (so a sketch
  stays face-on) and clamp the distance to 30..600 mm. 12 scripted checks pass.
- **Reflective sheets.** A sky sheen (neutral light-above, dark-below gradient reflected by the view vector) plus a real mirror image of
  objects (mirrored camera into a half-resolution render target, clipped to the camera side of the plane; reflectables on layer 1, lights too),
  both Fresnel-weighted; premultiplied blending so reflected objects blend toward their color. Defaults sheen 0.22, objects 0.35. The tuning
  panel has a Reflection section (strengths, straight-on reflectivity, glancing sharpness, sky colors). Nothing real is reflected yet except
  the test boxes; extruded bodies will be. Two bugs found by looking at screenshots: lights on the wrong layer rendered reflected objects
  black, and screen-blending a dark reflection onto a bright sheet was almost invisible.
- 20 unit tests plus scripted browser suites (lock-in 12, stage 2 27, origin 12) all pass; no console errors.

**Open for the human:** tune the reflection values with `bash tools/preview.sh tune` (sheen, object reflection, glancing sharpness); try the
lost-origin prompt and O.
**Next:** stage 3 (extrude with Shapr3D-style defaults, history list, drawer); reflections will then show real bodies.

## Handoff 019 — 2026-11-04
**State:** `in_032` (with a screenshot): the human got a near-white, blurry, extremely magnified view with a thick green axis line and
could not tell what was happening. **I could not reproduce that exact picture** (a render at the old 0.5 mm limit was dark and sharp; a
render 8 km from the origin at 4 mm was still sharp), so the cause is unconfirmed. Most likely cause is a fast wheel/trackpad flick
driving the zoom to the old limit. Changes in `prototypes/cad-ui` (all values in `settings.js`):
- Zoom speed is rate-limited (`maxZoomFactorPerSecond` 2.5; a 220-event flick now goes 120 to 21.7 mm instead of hitting 0.5 mm).
- Distance limits tightened to 3..5000 mm.
- The status pill shows the current grid scale ("grid 100 mm").
- A reset prompt appears when zoomed very close or very far ("Zoomed very close: reset view (O)"); **O** resets the view.
- 20 unit tests and the lock-in, stage 2 and origin scripted suites pass.

**Open for the human:** please send what you were doing (wheel or trackpad, pinch or scroll), what the status pill said, and whether the
`?tune` panel was open. Still pending: reflection tuning via `bash tools/preview.sh tune`.
**Next:** confirm the cause of the screenshot; then stage 3 (extrude).

## Handoff 020 — 2026-11-04
**State:** `in_033`: the bad screenshot happened with the `?tune` panel open (it loaded that way, and the problem did not appear without the
panel; the panel persists its own view values in the browser, which is the likely cause). The human asked to drop the reflective sheets and
move on to sketching mechanics and extruding. Removed from `prototypes/cad-ui`: the reflection passes, mirror render target and `settings.reflect`;
the whole tuning panel (`src/tune.js`, `?tune`, `preview.sh tune`). Kept: tuned look values (`in_031`), return-to-origin, the zoom safety
(rate limit, 3..5000 mm, grid scale readout, reset prompt). Verified: 20 unit tests, page loads with no console errors, screenshot looks right.
**Open for the human:** confirm the plain `bash tools/preview.sh` view looks right. Then choose what sketching mechanics come first.
**Next:** sketching mechanics (proposal to the human), then stage 3 (extrude with Shapr3D-style defaults, history list, drawer).

## Handoff 021 — 2026-11-04
**State:** `in_034` ("dimension tool first, then extrude"). Dimension tool built in `prototypes/cad-ui` (`src/dimensions.mjs`, session
and store `update` command, DOM number chips, dimension lines): D, point at a shape, type a number, Tab, Enter; one undo step; no constraint
solver (direct edit; anchors documented in `dec_ui_conventions`). 25 unit tests pass; browser run drew a rectangle, set W 60 and H 20 and
undid it, no console errors. This is the AI's design; the human has not tried it.
**Next:** extrude (stage 3).

## Handoff 022 — 2026-11-04
**State:** `in_034` continued: extrude built in `prototypes/cad-ui` (AI's design; the human has not tried it). `src/extrude.mjs` (pull distance:
drag steps, typing, add or cut), `src/features.mjs` (feature list to operation graph), store `addFeature/updateFeature/removeFeature` on the
same undo stack as sketch edits, `src/body.js` + `src/worker.js` + `src/interpreter.mjs` (OCCT in a worker, copied from `sketch-extrude`; deps
`replicad`, `replicad-opencascadejs` added to `cad-ui`, already in `docs/licenses.md`), a History list top left, and an instant ghost prism.
30 unit tests pass. Browser runs: rectangle extruded 20 mm (volume 9547.03 = closed form), circle on XZ pulled -30 cut the body
(14869.03 = closed form), undo and redo, history edit by drag (+28), Delete removed the feature, no console errors.
**Known limits:** only the three base planes can be sketched on, so a cut starts at the plane through the origin and may not reach the face you
are looking at; extrusions keep a copy of the shape. These are what "sketch on a face" (next) would fix.
**Open for the human:** try `bash tools/preview.sh`: R, draw a box, E, click it, pull; then a circle on another plane, E, pull the other way;
D to resize. Tell me what feels wrong. `q_kernel_choice` is still undecided; this reuses OCCT only as the working engine.
**Next:** sketch on body faces; the drawer; whatever the trial turns up.

## Handoff 023 — 2026-11-04
**State:** `in_035` (feedback after trying extrude). Done in `prototypes/cad-ui`: orthographic camera face-on to a plane (perspective in 3D); leaving
plane view re-picks the hovered plane at once; thin sketch lines (dark with a light halo); closed shapes as cream faces; slight blue on hovered and
selected planes (surface, grid, sketch lines); sketch lines now draw over a body in sketch view; **backdrop experiment**: near-transparent plane plus a
separate cream sheet behind it, drawn in its own pass before the scene so it never covers objects (`settings.backdrop`, `enabled: false` = old look).
30 unit tests pass; browser screenshots checked; no console errors. The old tuned brightness/opacity values (`in_031`) are unused while the backdrop is on.
**Open for the human:** is the sheet cream enough (it reads grayer than the face fill), is the blue slight enough, does the offset sheet feel right?
**Next:** sketch on body faces; the drawer.

## Handoff 024 — 2026-11-04
**State:** `in_036`. In `prototypes/cad-ui`: bone color (#e3dccb) for sheet, faces and bodies; unextruded closed sketch shapes are semi-transparent faces
(fill hidden once extruded); camera-following key and fill lights with a clear-coat sheen on bodies (`settings.light`); hover any flat axis-facing body face
(blue), click to go orthographic face-on and sketch on it (also hotkeys and the right-click menu). Mechanics: the worker returns each flat face's triangle
range, axis, sign and offset; `viewmath.addFacePlane` makes a frozen "face plane" (reused for the same face; base planes reused when they match); features
carry a `frame` that the interpreter turns into a replicad `Plane`. Browser run: extruded a box, sketched a circle on the top face, pushed -5 and the volume
matched the closed form (15607.30). 33 unit tests pass; no console errors.
**Limits:** slanted and curved faces cannot be hovered yet; face planes are frozen copies (see `q_topological_refs`); sketch on a face while another body
face is hovered in sketch view is not offered.
**Open for the human:** is the sheen the right amount (`light.sheen`, `light.key`)? Is the bone color right? Does face hover/click feel natural?
**Next:** the drawer; fillet/chamfer on faces and edges (hover and click), if the human wants.

## Handoff 025 — 2026-11-04
**State:** `in_037`. In `prototypes/cad-ui`: sketch lines thin and black (no halo); body and cream faces lighter, with more sheen and a soft studio
reflection (`settings.light`); axis lines faint through objects (a second axis-only pass drawn only behind existing depth) and axis arrows faint when a
body is in front (ray test); clicking selects without moving the camera (plane, flat body face, unextruded closed sketch shape; hover tints blue, a body face
beats the see-through planes); with a selection, **E** extrudes (a closed shape, or push/pull of a body face via the new `faceExtrude` op using OCCT
`basicFaceExtrusion`), **S** or R/C/L sketch on it (the only thing that goes orthographic). History lists push/pull steps. Verified: kernel volumes
(box 16000; pull top +10 = 24000; push -5 = 20000; pull side +5 = 18000; missing face reports an error), browser flow (select does not change the view, E, typed
distance, Enter, push, side face + R goes face-on), 34 unit tests, no console errors. Bug found by looking: a `//` comment swallowed other values on one settings
line (body edge and add/cut colors were undefined) until the screenshot showed white edges.
**Limits:** slanted and curved faces cannot be selected; a face push/pull can fail if earlier steps move the face; planes are only selectable where no body is under the cursor.
**Open for the human:** do selection and E on a face feel right? Is the body light and shiny enough (`light.sheen`, `light.reflect`, `light.key`)?
**Next:** the drawer; fillet/chamfer on selected faces or edges (edge selection), if the human wants.

## Handoff 026 — 2026-11-04
**State:** `in_038`. **Bug** (rectangle on a plane, then 3D: plane not selectable): my own regression from Handoff 025, `hitRegion` was not imported in
`main.js`, so hover threw whenever a closed sketch existed. Fixed, and re-tested with a sketch present. Built in `prototypes/cad-ui`: the last plane that was
showing keeps showing (hover style) when nothing else is; a hovered or selected sketch shape also shows its plane; single click selects corners, lines, faces,
sketch shapes, planes; double-click selects the whole body; whole-body move / rotate / scale (M / T / K, X Y Z axis, drag or type, history steps, editable) via a new
`transform` kernel op (about the box centre) and `TransformSession`; the worker now returns edges (polylines) and corners. Wording: S = "sketch from this face".
Verified: kernel (move x+10, rotate z 90, scale 2 = 8x volume), browser run (plane select with sketch present, sticky plane, corner, line, double-click body, move 15,
rotate 90, undo, history labels), 34 unit tests, no console errors. New open question `q_direct_modification` (extrusion vs direct modification, from the human's
idea). **Lesson:** I had not tested "sketch exists, then 3D" after adding sketch-face picking; add that case to the scripted checks (they live in the scratchpad, not the repo).
**Limits:** lines and corners cannot be modified yet; rotate by other than 90° breaks face selection; non-uniform scale is not supported.
**Open for the human:** `q_direct_modification`; which modifications first (radius of a curved face, fillet or chamfer a selected line, rotate a face)?
**Next:** the drawer; the modifications the human picks.

## Handoff 027 — 2026-11-04
**State:** `in_039`. Fixed: drawn (unextruded) sketch shapes could never be hovered or selected in 3D because `pickSketchFace` indexed a `THREE.Vector3` like an
array (`d[axis]` is undefined); now uses `getComponent`. Exactly one world plane shows at any time (sketching plane, else pointed-at, else last shown); a single click on a
world plane orients to it, a click on the model only selects; faces are oriented to only via "Sketch on surface" (menu, or S on a selected face). Zoom roughly 2x more
sensitive (`zoomPerWheel` 0.003, `maxZoomFactorPerSecond` 5; one notch about x0.82). Verified in the browser (world click orients, drawn shape selects, face click leaves
the view, away keeps the last plane, no console errors); 34 unit tests pass.
**Lesson:** the earlier "selects the plane with a sketch present" check passed because it only proved the plane fallback; it did not prove the sketch face was picked.
**Open for the human:** zoom feel; the hotkeys S / R / C / L on a selected face still orient to it (an explicit command) in addition to the right-click menu.
**Next:** the drawer; modifications the human picks (`q_direct_modification`).

## Handoff 028 — 2026-11-04
**State:** `in_040`. In `prototypes/cad-ui`: double-click a world plane orients; a single click in the world (plane or nothing) deselects and applies a running extrude/move/rotate
(a press without a drag is a click); E only extrudes sketch shapes; M moves a body (X/Y/Z) or a face along its normal; T rotates a body or **tilts a face** (new `faceTilt` kernel op:
wedge added where the face lifts, removed where it dips); K scales a body; lines and corners are selectable only. Lighting more contrasting (`light.key` 2.1, `fill` 0.1,
`ambient` 0.22, lighter body color). **Two bugs found by looking, not by the numeric checks:** (1) the selected-face tint vanished when the mouse moved off the face: the tint
geometry shared the body's vertex buffer, and disposing the hover tint deleted the buffer for the others (now each tint has its own copy); (2) the first tilt had the right volume
and bounding box but the wrong shape (half-space flipped about a non-perpendicular axis, so add and cut landed on the same side); caught by a screenshot, then by slicing the result,
and now covered by `test/kernel.test.mjs`, which runs the real kernel in node (move face, tilt heights, body move/rotate/scale). 37 tests pass.
**Open for the human:** how moving a line or corner should behave (`q_direct_modification`): it reshapes neighbouring faces, which OCCT solids do not do directly; options are
rebuilding a polyhedral body from its planes, or limiting to cases that stay valid.
**Next:** the drawer; edge/corner moves if the human picks an approach; fillet/chamfer on a selected line.

## Handoff 029 — 2026-11-04
**State:** `in_041` approved the plan (`dec_direct_modification`, accepted). Built in `prototypes/cad-ui`: line **fillet (F) and chamfer (B)** (kernel op `edgeMod`, line found by its end points and midpoint),
full round face **radius (M) and taper (T)** (ops `cylRadius`, `cylDraft`: a revolved ring or wedge added or cut, outside a post, inside a hole; the worker now reports full round faces and line midpoints).
All are steps in the history (editable, undoable) through the generalized transform session (`xform.kind`). Verified: 39 tests (closed-form volumes for fillet, chamfer, post and hole radius, taper, errors for a missing
line and an over-steep taper); browser run (fillet 2 mm and radius 3 → 4 gave the exact volumes; taper 10° gave 16722.5 = frustum + rest; screenshot shows a rounded edge and a tapered post); no console errors.
**Limits:** partial round faces (arcs), cones, slanted faces and non-axis-aligned round faces are not selectable for these; a taper keeps the low end of the face and the angle sign picks the direction; corners cannot be modified.
**Open for the human:** which operation next (offset a round rim, hole from a face, shell, mirror?); `q_direct_modification` replay-versus-edit-the-source.
**Next:** the drawer; the human's pick.

## Handoff 030 — 2026-11-04
**State:** `in_042` bug: a selected closed sketch shape lost its blue as soon as the cursor left it. Cause: in `buildSketchViz` a local `const sel` (is this shape selected in the sketch
view?) shadowed the module-level 3D selection `sel`, so the 3D selection test always read undefined and only the hover blue showed. Renamed the local to `skSel`; a shape selected in the
sketch view (select tool) now also turns blue and stays so. Verified by reading the fill colors and pixels after the cursor moved away, in both views.
**Lesson:** a persistent-selection feature needs a test that moves the cursor away, which is what the earlier checks lacked for sketch shapes.

## Handoff 031 — 2026-11-04
**State:** `in_043`. In `prototypes/cad-ui`: **Delete** deletes the selected sketch shape or the whole body (new history step `clear`: later steps start a new body; undoable); **R** is rotate
(was T; rectangle when nothing is selected, always rectangle in the sketch view); **faces at any angle**: the old code only reported axis-aligned faces, so a tilted face could not be selected, and
planes were axis-aligned throughout. Generalized: the worker reports every flat face with unit normal n and offset d; `viewmath` planes are n/d/basis (any orientation, `addFacePlane({n,d})`,
`planeOrigin`, general `projectOnto`/`pickPlane`); the plane shader takes the plane's own axes (`uU`, `uV`) and the sheet meshes are oriented by quaternion; kernel `findFace`/`faceExtrude`/`faceTilt` use n and d
(the tilt axis is the chosen world axis squeezed into the face). Verified: kernel tests (find, move and re-tilt a tilted face; delete body), viewmath test for a tilted plane (not mirrored, view along
the normal), browser run (tilt top 10 degrees, select it, S goes square to it, rectangle, extrude 6 perpendicular to it, double-click body + Delete, undo), screenshots; 42 tests, no console errors.
**Limits:** deleting a single face is not offered; the grid axis lines on a face sketch plane are the world axis lines' colors (not meaningful there); a datum plane's ref goes stale if earlier steps move the face.
**Next:** the drawer; the human's pick of modifications.

## Handoff 032 — 2026-11-04
**State:** `in_044`: the human answered the kernel question with option 3 (OCCT now, our own kernel later, kept unpluggable). Recorded as `dec_kernel_hybrid` (accepted) and `inv_kernel_boundary` (accepted); `q_kernel_choice` deleted
(answered). Code: all OCCT code moved to `prototypes/cad-ui/src/kernel/occt/` (`oc.mjs`, `interpreter.mjs`, new `evaluate.mjs` = graph in, plain-data result out, thin `worker.js`); `src/kernel/index.mjs` and `client.js` are the only
switch points; `body.js` uses `spawnKernel()`; contract in `src/kernel/README.md`; kernel tests became `test/kernel-conformance.test.mjs` (only the interface, no replicad import; new `cropBox` op for measuring pieces; plus a
"result is plain data" test); `tools/check_kernel_boundary.py` enforces the boundary (verified it catches a stray import). 43 tests pass; the app still builds and runs through the worker.
**Open for the human, one at a time:** `q_constraint_solver` next, then `q_topological_refs`, `q_direct_modification`, `q_grid_role`.
**Suggestion for the working agreement:** run `python3 tools/check_kernel_boundary.py` with `check_docs.py` at session start (I did not edit CLAUDE.md; your call).

## Handoff 033 — 2026-11-04
**State:** `in_045`: the human chose option 2 for the constraint solver (a small one of our own). Recorded as `dec_constraint_solver_small` (accepted); `q_constraint_solver` deleted. Not built.
References updated (dimension code comment, README, licenses, `dec_ui_conventions`, roadmap). Next question asked: `q_topological_refs`, with a demonstration that editing an extrusion from 20 to 25 mm
makes a later "move top face" step fail ("face not found"), because the reference is geometric.
**Open for the human, one at a time:** `q_topological_refs` (asked), then `q_direct_modification`, `q_grid_role`.

## Handoff 034 — 2026-11-04
**State:** `in_046`: the human chose option 2 for references (names by construction, geometric fallback). Recorded as `dec_stable_references` (accepted); `q_topological_refs` deleted. Not built; the proof test
(change an upstream number, a later face move and fillet still attach) is part of the decision. Next question asked: `q_direct_modification` (replay as steps versus edit the source feature).
**Open for the human, one at a time:** `q_direct_modification` (asked), then `q_grid_role`.

## Handoff 035 — 2026-11-04
**State:** `in_047` to `in_049`: the human thought through additive history and sketch ownership, then approved four points. Recorded: `prin_history_additive` (principle), `dec_modifications_are_steps`
(every modification appends a step, never edits a sketch; answers and replaces `q_direct_modification`, deleted), `dec_sketch_belongs_to_step` (a sketch belongs to the step that consumes it: hidden from the plane, shown and
edited with its step, edits go through the solver with a warning when later steps override them; a later explicit "fold into the sketch" command is possible). None of the three is built yet (today a sketch stays on its plane
after extrusion). Open questions left: `q_grid_role` only (asked next).
**Not built, in rough order:** consume sketches on extrude (hide, restore on undo, show with the step); named references and their proof test; the small solver; the drawer; save/load and STL/3MF export.

## Handoff 036 — 2026-11-04
**State:** `in_050`: the human chose option 1 for the grid. Recorded as `dec_grid_ui_only` (accepted); `q_grid_role` deleted. **No open questions remain** (`ls docs/decisions | grep '^q_'` is empty).
Decisions this session of questions: kernel (option 3, `dec_kernel_hybrid`, built as `src/kernel/`), solver (option 2), references (option 2), modification and sketch ownership (additive; three entries), grid (option 1).
**Built vs not:** built: kernel isolation. Not built: consume sketches on extrude, named references and their proof test, the small solver, the drawer, save/load and STL/3MF export, partial round faces and other limits listed in earlier handoffs.
**Next:** the human picks the build order (my suggestion below in the chat reply).

## Handoff 037 — 2026-11-04
**State:** `in_051`: built **sketch ownership** (`dec_sketch_belongs_to_step`): `SketchStore.addFeature(..., consumed)` takes the loose entity off its plane (undo, redo and removing the step restore or re-consume it); `store.entities("feat:<id>")` is a view of
a step's own shape (updates patch the step; add and remove are refused); the session has `editKey`; History extrusions have a "sketch" button (`editFeatureSketch`) with a later-steps warning; draw tools and re-extruding are refused in a step's sketch.
3 new tests (46 total); browser run: loose sketch consumed (1 to 0), undo and redo, resized the step's sketch 25 to 80 mm and the body volume followed (10096 = 80 x 12.62 x 10), no console errors.
**Next (as the human asked):** constraints (the small solver, `dec_constraint_solver_small`), then polish sketching.

## Handoff 038 — 2026-11-04
**State:** `in_051` continued: **constraints built.** `src/solver/solver.mjs` (pure small solver: Levenberg-Marquardt, numeric Jacobian, rank/DOF, redundant and conflict detection, soft preferences for dragging), `src/sketchsolve.mjs` (shapes to
solver and back; rectangle carries built-in horizontal/vertical), `src/sketchpick.mjs` (pick corner/line/circle, which constraints fit, marks). Store: constraints per sketch (loose and per step), one-undo-step `edit()`, constraints move with a consumed
sketch. Session: picks, `offers`/`applyOffer`, glyph marks, `deleteConstraint`, drag with the solver (`dragStart/Move/End`), dimension edits are stored constraints (solved, conflicts refused). Polish: hover highlight and pointer cursor on
corners/lines/circles, auto horizontal/vertical for drawn polyline segments, DOF status, locked dimension look; the old direct-edit `applyDimension` was removed. 69 tests (solver 8, mapping 7, picking 3, ownership 3, more); browser runs: ownership (consume, undo, edit a
step's sketch), constraints (two lines Equal length, drag a corner keeps a square, circle dimension, undo), and the earlier face/body modify flow: all pass, no console errors.
**Limits / next polish:** no angle, tangent, point-on-line, midpoint, symmetric or arcs; rectangles cannot be rotated; polyline dimension edits no longer shift later points rigidly (the solver moves the end point only); constraint marks can overlap on small
shapes; no keyboard shortcuts for constraints (buttons only). Candidates: arc tool, trim, offset, mirror, angle dimension, a constraint mode for typing values on marks.

## Handoff 039 — 2026-11-05
**State:** `in_052`: the human's design for intuitive constraints, built: click a line to see and type its length; click a circle outline for its radius; two lines sharing a corner show the angle (type to set, 1 to 179 degrees; the first line stays, the second
turns and keeps its length); two lines not sharing a corner get Parallel / Perpendicular / Equal length. New solver constraint `angle`; `sketchsolve.tryConstraint` tries any constraint first (conflict, already true, collapsed geometry, folded lines)
and the buttons are greyed out with the reason (hover), typed values are refused with it. Session: `valueChip`, typed pick values, `offers()` with `enabled` and `reason`. 76 tests (new `lineui.test.mjs`: square cases: corner angle, parallel,
perpendicular, opposite sides, equal length; collapse; polyline angle; separate lines parallel). Browser run confirmed the chips, the refusals with reasons, and the polyline angle (screenshot). No console errors.
**Not yet:** tangent, point on line, midpoint, symmetric, arcs; the value chip is not clickable (type directly or press Enter); with nothing anchored a length change can shift the whole sketch a little (the solver moves the least).
**Next candidates:** save/load and STL/3MF export; named references with the proof test; arcs and trim/offset/mirror; the drawer.

## Handoff 040 — 2026-11-05
**State:** `in_053` bug: clicking a line showed no length input. Cause: the CSS for the value chip (`#vchip`) and for disabled constraint buttons never landed in `index.html` (my edit used a search string that did not match, so the replace silently did nothing); the chip existed
but was an unstyled block at the top left, invisible. My browser test read the chip's text, not its position, so it passed. Fixed by adding the CSS; verified with the chip's measured position and a screenshot (the number appears above the line, the unusable buttons are greyed).
**Lesson:** a UI check must look at where the element is (or a screenshot), and edits that do a text replacement must assert the replacement happened.

## Handoff 041 — 2026-11-05
**State:** `in_054`. Built in `prototypes/cad-ui`: (1) **context action bar** (`src/actionbar.mjs`, pure, 4 tests; DOM in `main.js` `updateBar`/`runBar`; full width at the bottom, wraps when narrow, the status line sits above it): sketch tools, constraint buttons that
fit the picks (lit when on, greyed with a reason when not possible), 3D actions per selection, Apply/Cancel during an operation, each with its hotkey from the keymap; new constraint hotkeys Shift+H/V/E/L/P/F/C. The old floating button bar is gone. (2) **Constraints fixed:**
already-true constraints can be added (lock), asking for an active one turns it off (toggle), refusals only for conflict, collapse or folding; conflicts name the constraint ("conflicts with Horizontal"). (3) **Rectangles are four lines with real stored constraints** (the rectangle tool makes a
closed polyline plus horizontal/vertical constraints; the legacy `rect` shape with built-in rules remains only for tests); you can turn a constraint off and shear it. (4) **Constraint marks show only for what is picked.** `dec_context_action_bar` accepted;
`dec_sketch_lines_and_constraints` **provisional** (the human said "I am not sure"; needs their confirmation). 82 tests; browser runs measured the bar's position (full width, y=595 of 640) and contents in sketch and 3D, toggles with Shift+H, the perpendicular lock with Shift+P,
marks only for the picked line, screenshots checked; regression runs (extrude a drawn rectangle, edit a step's sketch, face/body flow) pass; no console errors.
**Lesson (again):** a trailing `//` comment appended to a settings line swallowed the keys after it (`home`, `dimension`), caught by the new bar test; never add a trailing comment to a line that has more entries after the insertion point.
**Not yet:** dimension chips for a rectangle are four lengths (no W/H pair); circles are not lines (no arcs yet); legacy `rect` code paths can be removed later.

## Handoff 042 — 2026-11-05
**State:** `in_055` look tuning in `prototypes/cad-ui` (all in `settings.js`): blue pick lines thinner (sketch 4 to 2.2 px, hover 3 to 1.7; 3D line 4.5 to 2.4, hover 3 to 1.8; corner dots smaller); `bodyColor` 0xf9f6ee, `ambient` 0.42, `key` 1.7; `sheet` darker (0.80, 0.78, 0.72);
gloss down and diffuse (`roughness` 0.6, `sheen` 0.22, `sheenRoughness` 0.55, `reflect` 0.3). Measured before and after on a box (top 237 to 240, left face 163 to 167, right face 147 to 160, plane 150 to 137) and checked screenshots. My first try blew the top face out to white (key 2.1
with a lighter color), so I raised ambient instead of the key light. 82 tests pass.

## Handoff 043 — 2026-11-05
**State:** `in_056`: the action bar is now trimmed to the selection. Sketch view: nothing picked or a drawing tool in use = the sketching tools (no Extrude); lines, corners or circles picked = only their constraints, Delete, Undo, Redo; a whole closed shape picked = Extrude, Dimension, Delete;
an open line has no Extrude. 3D view unchanged (it already followed the selection; Extrude appears for a selected closed sketch shape only; a body face offers Move, Tilt, Sketch on surface). Updated `src/actionbar.mjs`, `main.js` (`barContext`), tests (82 pass). Browser run read the bar after each selection (rectangle tool, nothing picked, a line, the whole shape,
deselected) and a screenshot confirmed the line case; no console errors.

## Handoff 044 — 2026-11-05
**State:** `in_057`. Fixed the overlap and the collapse (the number chip and the constraint marks sat in the same spot, and clicking the number hit a mark, which selected the constraint and cleared the picks). New in `prototypes/cad-ui`: **one selection pill** (`session.widget()`, DOM `#pickw`): the constraint **icons** that belong to the picked line, corner, circle or shape
(set in `src/icons.mjs`: horizontal, vertical, perpendicular, parallel, equal, coincident, fixed, dimension, angle, radius, lock), a separator, then the number (LEN, RAD or ANG) with a lock when stored. New look: dark rounded pill, round icon buttons, a monospace number that is clickable (starts typing). Clicking an icon selects that constraint **without clearing the selection** (the number stays);
Delete removes it. The old floating chip and letter marks are removed. 84 tests (2 new for the widget). Browser run measured the pill (one pill, y=160, 131 px wide: icon, LEN 26.01), clicking the number starts editing, typing 120 resized the line and showed the lock, clicking the icon marked it picked and kept the number, Delete removed it; screenshot at 2x checked; no console errors.
**Not yet:** icons for a pair of lines' relation sit in the same pill at the angle spot; no icon tooltips beyond the title; dimension tool chips still use the older style.

## Handoff 045 — 2026-11-05
**State:** `in_058`: icons for everything, text only in tooltips. `src/icons.mjs` now holds 40+ icons (tools, constraints, 3D actions, undo/redo, apply/cancel, delete, home/origin, 3D view...). `actionbar.mjs` items carry `icon` and `help`; the bar renders icon buttons (42 x 38) with a one-glyph key badge (⇧H, ^Z); a custom tooltip (`#tip`, `showTip`/`withTip` in `main.js`) shows name, key, help, and the reason in orange
when a button is off; the selection pill's icons and number use it too. The status line no longer repeats the bar's actions (3D: "Selected: face"; the select tool prints nothing; drawing prompts stay). A test checks every action in every context has an icon and help (85 tests). Browser runs measured the bar (8 buttons, 55 px high, no label text), the tooltip text and position, and screenshots at 2x for sketch, body and face contexts; no console errors.
**Not yet:** the History list and dimension-tool number boxes still use text; icons are my drawings (simple strokes) and can be refined; tooltips do not show on touch.

## Handoff 046 — 2026-11-05
**State:** `in_059`: sketching works from any camera angle. `inSketchView()` now means "a plane is chosen and no operation is running" (it used to also require the camera to be face-on, and orbiting away dropped the sketch); `isFaceOn()` is the separate "looking straight at it" check (orthographic camera and the existing face-on logic stay).
Orbiting no longer exits the sketch (removed); `pxPerMm(uv)` measures the screen scale at the pointer on the plane so snapping and picking behave at an angle; `localPoint` limits very distant grazing hits; new action `faceOn` (**N**, button "Look straight at the sketch", shown in every sketch context when not face-on); the bar's exit button is now "Exit sketch" (Esc).
Browser run: entered a sketch (face-on), orbited with the right mouse to an oblique view (e = 1.21), the sketch stayed (bar showed the sketch tools), two clicks drew a rectangle whose corners came out exactly (-20,-10) to (20,12), picking a line showed its length pill, N squared the view up (normal = true); screenshot checked; the earlier ownership and face/body flows pass; 85 tests; no console errors.
**Limits:** nearly edge-on views make clicks on the plane imprecise (grazing rays); dimension chips and the pill are placed in screen space so they are fine, but tolerances are approximate at steep angles.

## Handoff 047 — 2026-11-05
**State:** `in_060`: a single click on a world plane (nothing selected, nothing running) enters the sketch face-on; a click that exits a state (selection, running operation, picked line or corner) only exits. In a sketch at an angle, clicking the empty plane squares the view; **N** and the bar's view button toggle between square and the remembered 3D angle (`goSquare`/`goOblique` in `main.js`, bar item "3D angle" / "Look straight at the sketch").
Browser run: click on the XZ plane entered the sketch (normal = true); orbit made it oblique (e = -0.42); clicking the plane squared it; N returned to e = -0.42, N again to square; no console errors. 85 tests pass. Not browser-checked: exiting a running operation by a plane click (logic unchanged from `in_040`).
**Not yet:** the old double-click orient handler can be removed; `dec_sketch_lines_and_constraints` still awaits the human's confirmation.

## Handoff 048 — 2026-11-05
**State:** `in_061`: the bottom bar is removed (`#abar`, `updateBar`). Right click now picks what is under the pointer (3D: face/edge/etc. unless a plane; sketch select tool: line/corner/circle) and shows the old bar items as a menu (icon, name, hotkey; disabled with reason in the title); op mode shows Apply/Cancel. Pill: clicking a constraint icon opens it with an x (delete) and highlights what it relates in amber (`session.relatedRefs()`, `settings.sketch.relatedColor`); clicking it again lets go. `status` line moved to the screen bottom.
Browser runs: menu with nothing picked, on a line (Horizontal/Delete/Undo...), on a 3D face (Move/Tilt/Sketch); the icon opens with x, related = the line, x deleted the constraint (3 left); screenshots checked; 85 tests; no console errors. Not browser-checked: a two-line relationship (parallel) shows both lines amber (same code path, one ref per line).
**Not yet:** 3D selections show no "what is applied" beyond their name; tooltips for the menu rows are the native title; the status line may repeat less.

## Handoff 049 — 2026-11-05
**State:** `in_062`: (1) `SketchSession.keepOpenLine()` commits a line in progress (2+ points) as an open polyline on Esc, tool change; (2) right-click on a plane or flat face (3D) adds Line / Rectangle / Circle (`surf:<tool>` items in `barItems`, `menuSurface` in `main.js`) that enter the sketch on that surface with the tool. 87 tests (2 new). Browser: right-click on a plane listed the tools, Line entered the sketch square-on with the line tool, three clicks and Esc left one open 3-point poly; no console errors.
**Not yet:** while a line is being drawn the segments are not committed until you stop; the exit-sketch route (Esc twice) keeps it via the first Esc; sketching still needs the square-on sketch view after starting (no mode-free drawing in the 3D view); a face tool on curved faces is not offered.

## Handoff 050 — 2026-11-05
**State:** `in_063`: `enterSketch` skips `goNormal` when the tool is line/rect/circle and the surface faces the camera by at least `view.drawMinFacing` (0.3). Browser: pointing at the XZ plane and pressing R kept the camera (e 0.6, a -0.79, normal false), two clicks drew a rectangle on the plane, screenshot checked, no console errors. 87 tests.
**Not yet:** no unit test for the camera rule (it lives in main.js); snapping and typed sizes at steep angles are only approximate (`in_059` limits).

## Handoff 051 — 2026-11-05
**State:** `in_064`: temporary style switcher (`#styleSwitch`, `applyStyle`) with four styles from `settings.styles`; panes mode in the plane shader (`uPane`, `uEdgeA`, `uFadeC`, `uFadeR`; axis lines are never masked) and `updatePlanes`; panes-only picking via the new `within` option of `pickPlane`; sketch grid eases in (`paneFade`). Browser: pane hover/click entered a sketch, far from the panes nothing hovers, screenshots of all styles checked, no console errors. 87 tests.
**Not yet:** no unit test for the pane pick rule; the choice is not remembered between runs; the old sheet style is untouched. Remove the switcher once a style is chosen.

## Handoff 052 — 2026-11-05
**State:** `in_065`: a fifth style "Pencil (white)": `themes.pencil`, `styles.pencil` (`shortAxes`, `paneSize`, `paneOffset`, `paneRadius`, `hoverBlue`); shader got `uPaneOff`, `uPaneR` (rounded-square signed-distance pane) and `uAxisLen` (axes only 0..arrow length). Pane picking honours the offset. Browser: hover lights one pane, a drawn and extruded box showed grey; screenshots checked; no console errors; 87 tests.
**Not yet:** selection blue is still blue in this style; the sketch grid in this style is untested by eye.

## Handoff 053 — 2026-11-05
**State:** `in_066`: sketch grid fades in only when `isFaceOn()` (`panes.orthoGridOnly`); Pencil grid finer (`lodDivisor` 30) and darker; axis lines/arrows hidden behind objects in panes styles (`panes.axisBehind` 0); pane picking checked from four camera angles above and below (all three panes hit) and a real click from below entered the sketch. Browser screenshots of the face-on grid and the 3D view (grid gone) checked; 87 tests; no console errors.
**Open:** "select from either side" - I could not reproduce a pick failure; the one difference I found is that clicking from below turns the view to the plane's standard front side (e.g. from above for XY), not to the side you were on. Asked the human what they see.

## Handoff 054 — 2026-11-05
**State:** `in_067`: sixth style "Compass (blank)" (`mode: "compass"`): no axis lines, arrows or panes (shader `uAxisA` 0, no pane), nothing pickable in 3D except body faces; DOM `#compass` (SVG tripod from the camera's right/up/forward, far axes drawn dim) and three buttons (`updateCompass`, `COMPASS_BUTTONS`) calling `enterSketch`; the active plane's button is filled. Browser: compass at bottom right, Z button entered XY face-on, X button YZ, Esc left, no plane hover in 3D, screenshots checked, no console errors. 87 tests.
**Not yet:** buttons look straight at the plane from its standard front side only; no way to sketch on a plane from the world itself in this style (by design); the compass is not clickable on its letters.

## Handoff 055 — 2026-11-05
**State:** `in_068`: the Compass style now begins as Pencil (axes + panes), latches to the corner after the first sketch when you are back in 3D (`stepCorner`, `compassHome`, `cornerT`; world axes/panes fade by `cornerK`, an SVG overlay tripod flies from the origin's screen position, radius from the world-axis length to 30 px, into the corner; buttons fade in). X/Y/Z keys (`keys.lookX..Z`, `ACTIONS`) and buttons call `lookAlong(ax)`: from the + end, then the - end; `lookSign`. New in `viewmath.mjs`: `flippedView`, `normalSide`; `isNormal` now accepts either side (grid fade, ortho camera and the face-on test work from behind); `goNormal(plane, side)`, `enterSketch(plane, tool, side)`; N / clicking the empty plane squares up from the side you are on (`cameraSide`). 88 tests (1 new, 1 changed: bare Z is now an action).
Browser: the compass is hidden before the first sketch, animates into the corner after Esc, X X Y Y Z Z gave +X, -X, +Y, -Y, +Z, -Z (azimuth/elevation checked; labels switch to -X, -Y, -Z), no console errors; screenshots checked.
**Caveats:** sketching from behind is mirrored on screen (u runs left); the corner is not remembered between runs; no unit test for the animation or `lookAlong` (main.js).

## Handoff 056 — 2026-11-05
**State:** `in_069`: home view `homeAzimuth` PI/4, `homeElevation` 0.5; plane clicks select (`selectFromHover`, `selPlane`, `actingPlane`) and panes/sheets show them blue (pencil theme blue now blue; `hoverBlue` removed from the pencil and compass styles); `armedTool` + `surfaceUnder` + `paneFilter` (drawing tool waits for a click on a surface; while drawing, another surface takes over the sketch); `normalAction` (N: front, back, front) replaces the square/oblique toggle; `Normal` button `#compassN` beside X Y Z (X Y Z now select the plane and look along it, or switch the sketch plane while sketching); the corner latch is `features.length > 0`. Bar/menu item "Normal to the plane" (also for a selected plane, face or sketch shape). 88 tests.
Browser: click on a pane selected it (sel plane), N went -1.57, 1.57, 4.71 (front, back, front); armed R then a click on the XZ and XY panes started the sketch with the camera unchanged and a second click finished a rectangle; extruding showed the compass in the corner at once with X Y Z N; Z then the N button flipped to the back (e = -1.57); screenshots checked; no console errors.
**Not yet:** move and rotate for a closed sketch shape (the human asked for it, "like any other plane"); the sheets style still shows only one infinite sheet; Esc while a tool is armed only clears it; `dec_ui_plane_selection` text still describes the older click rules (see `dec_ui_conventions`).

## Handoff 057 — 2026-11-05
**State:** `in_070`. Clean-up: removed the style switcher and all styles but the pencil + compass one (`settings.js` now has one theme `pencil` and a `panes` block; the shader lost the glow and ghost passes, `uBright`, `uGhost`; `main.js` lost `backdropScene`, `stateOf`, `shownPlane`, pinned hover, `applyStyle`, `goSquare`, `goOblique`, `obliquePose`, the dblclick listener, `ACTIONS.sketch`, the `surf:` menu items and `menuSurface`; `keys.sketch` and the Sketch on surface / on it items and icons are gone). New: `normalFor` (a normal view is always orthographic), click counting in `pointerup` (`clickCount`, `selectObjectFromHover`, `normalToClicked`; `input.multiClickMs/Px`), `bigWanted` + `#compassHit` (click the compass: big at the origin with a faint corner copy; click again: back), 3D menu offers Line / Rectangle / Circle (`draw` group). 88 tests (actionbar tests changed).
Browser: hover XY pane; one click selected it (sel plane, camera unchanged); three clicks turned the view to the top (a -1.57, e 1.57) and the camera was orthographic; orbiting made it perspective; after drawing and extruding a rectangle the compass sat in the corner, clicking it sent the axes back to the origin (cornerT 0, faint corner copy, axes hidden behind the body), clicking again returned (cornerT 1); screenshot checked; no console errors.
**Not yet:** double-click on a pane or empty space selects nothing (only an object under the pointer); moving and rotating a closed sketch shape; the older README sections (look tuning panel, tuning values) still describe removed things and are marked as partly replaced; scripted browser checks live outside the repo.

## Handoff 058 — 2026-11-05
**State:** `in_071` (use it as a user and look for bugs). Bugs found by scripted user journeys (select pane, tool, draw, extrude, face, circle on face, double and triple click, N, H, M, undo) and fixed in `main.js` / `index.html`:
1. **R did nothing on a selected pane**: R rotates a selected face or body, but it also rotated (with a "cannot" message) when a plane or sketch shape was selected, so the rectangle could not be started on a pane. Now only a selected face or body makes R rotate; anything else makes it the rectangle tool.
2. **Cursor and message while a tool waits for a surface**: the cursor stayed an arrow or hand; it is now a crosshair (also right after a tool starts, and back to an arrow for the select tool), and the status line shows "Rectangle: click a plane, a face or a sketch to draw on it   Esc to cancel" for as long as the tool is armed (it used to be a 2.6 s flash that stayed on after drawing started). Clicking where there is no surface keeps the tool armed (it used to drop it silently).
3. **Triple-click and N on a face left the face off-screen**: the view turned square to the face but was still centred on the old target; it now centres on the face (`goNormal(plane, side, at)`).
4. **The long status line covered the N button** in the corner: `#status` now has `max-width: calc(100vw - 230px)` and wraps.
5. A stale "S sketch on surface" in the face hint was removed.
88 tests; browser journeys show no console errors.
**Still to look at:** drawing on a sliver of a plane at a grazing angle gives tiny snapped sizes (snap grid is in mm, not pixels at oblique views); the default view is close to the 100 mm grid scale so a 40 mm box fills the screen; no scripted journeys are in the repo yet.

## Handoff 060 — 2026-11-05
**State:** `in_073`: reverted the touch-shadow commit (kept the lighter grid and the shorter status text; kept `in_072` in `human-input.md`). New `src/orb.js` (shared uniforms `hoverOrb`, `selectOrb`, `fullOrb`, GLSL falloff `orbProfile`, `orbMaterial`). Body face tints (`body.js tint`), sketch shapes (`orbShape` in `buildSketchViz`) and the pane shader (`uHC/uHR/uHA`, `uSC/uSR/uSA/uSFill`, `uOrbCol`) draw the orb on the surface; `hoverPoint` (from `hoverAt`, `pickSketchFace` now returns the hit point) places it; `updateOrbs()` each frame sets radius/strength; a click calls `startSelectOrb()` (radius from the click grows to `reachFactor` times the surface's reach, then fills flat over `settings.orb.fillMs`; `surfaceReach`). Panes no longer change fill or outline on hover. Removed `light.faceHoverOpacity`. 88 tests.
Browser: orb on a pane, on a closed sketch shape and on a body face under the cursor (soft blue, no edge) and the selected surface filled flat blue; sampled radius after a click: 1, 21, 97, 109 then 1e6 with fill 0.83 to 1; deselected: strength 0; no console errors.
**Not yet:** the orb does not fade out in time when the cursor leaves (it disappears at once); no orb on faces while sketching or on a body selected by double-click when it spans several faces (all its faces use the one orb centre); orb values are for the human to tune.

## Handoff 061 — 2026-11-05
**State:** `in_074`: the orb is now a ring. `src/orb.js` rewritten (`orbAlpha`: soft fill + crisp ring using `fwidth` for a constant pixel width; uniforms `uOrbRingA`, `uOrbSoft`, `uRingPx`); hover = ring only (`uOrbA` 0), click = ring radius grows from the click to the surface's far edge (`reachFactor` 1.04) while the soft teal fill spreads (`softFactor`, `fillMs`) and flattens; colour teal `[0.1, 0.72, 0.7]` (`settings.orb.color`), fill opacity 0.3 (`orb.selectOpacity`, replaces `light.faceSelectOpacity`); pane shader and sketch shapes use the same function. 88 tests.
Browser: a crisp teal ring on a body face and on a closed sketch shape under the cursor; after a click the whole face was filled with transparent teal; no console errors.
**Not yet:** I did not capture a mid-animation frame (the earlier radius sampling showed the ring radius growing then flattening); the ring is a perspective ellipse on oblique faces (a circle in the surface plane); selection of lines and corners is still blue.

## Handoff 062 — 2026-11-05
**State:** `in_075`: ring radius 0.025 view-distances, ring opacity 1, ring colour = `selectedLook(S.orb.color, S.orb.selectOpacity, bodyColor)` (new export in `src/orb.js`; shader `orbParts` returns fill and ring alpha separately, `uRingCol` uniform; same colour in the pane shader and sketch shapes). `settings.orb.color` marked as the teal to keep. Browser: small pale-teal ring on a face under the cursor; after the click the face filled with teal and the ring matches it (visible faintly); no console errors; 88 tests.
**Not yet:** on other backgrounds (a cream sketch shape, a pane) the ring is the same fixed colour, so it is not exactly the fill as seen there; the teal is not yet used for anything else.

## Handoff 063 — 2026-11-05
**State:** `in_077`: new accepted principle `prin_input_agnostic` (design for mouse, trackpad, phone touch and stylus from the start: intents not devices, no one-device-only features, pointer type sets precision and role, 44 px targets). `tools/preview.sh` now has `LAN=1` (vite `--host`, prints the phone address). Told the human the phone preview options (same Wi-Fi, USB with `adb reverse` on Android, a tunnel, a static deploy to Cloudflare Pages / Netlify / GitHub Pages). Nothing in the app changed.
**Known gaps for touch (not built):** orbit and pan exist only on the right and middle buttons; one gesture `g` at a time (no multi-pointer map); hover ring and right-click menu have no touch equivalent; no on-screen number pad; triple-click look-straight needs a touch equivalent (the N button exists in the compass only after the first object); bottom status and menu sizes untested on a phone screen.

## Handoff 064 — 2026-11-05
**State:** `in_078`. (1) Bug: the menu's Rectangle (tool item) called `ACTIONS.rect`, which rotates a selected face or body; `runBar` now calls `setTool` for tool items, and the Rectangle item shows no key when a face is selected (the face's R is Tilt). (2) Touch layer in `main.js` (`touchDown/Move/Up/Cancel`, `touches`, `tg`; the old pointer listeners are now `onPointerDown/Move/Up`): finger drag orbits, two fingers pan and pinch zoom (about the view centre), a tap runs hover, press and release at that spot (so select, draw points, double and triple tap work: `multiTapMs`, `multiTapPx`), a long press (`input.longPressMs`) opens the menu; while an operation runs, or a sketch point is under the finger with the select tool, the finger takes the mouse path. (3) Trackpad and desktop pan: Shift + scroll and Space + drag always pan; `scrollPans` (menu item, saved in localStorage) makes two-finger scroll pan. (4) A **⋯ menu button** (top right) opens the same menu for touch and trackpad. (5) Removed a duplicated block of elements in `index.html`. (6) Touch status text; stale S-key hints fixed. 88 tests.
Browser: Pixel 5 emulation with raw touch events: one-finger drag changed azimuth/elevation, two-finger drag moved the target, pinch changed the distance, a long press opened the menu, a tap selected the XY pane (a triple tap squared to it when taps were allowed more time); desktop: Rectangle in the menu on a selected face set the rectangle tool on the face plane (no rotation), scroll zoomed, Shift + scroll and Space + drag panned, the menu item turned scroll into pan; no console errors.
**Not yet:** no on-screen number pad; touch hit tolerance is the mouse tolerance; pinch zooms about the view centre; no pen-specific behaviour; on a phone the bottom status line is long and the compass buttons are small (28 px); the right-click and the triple-click `look straight` have touch routes (long press menu, triple tap) but the compass N appears only after the first object.

## Handoff 065 — 2026-11-05
**State:** `in_079`. (1) World planes: removed the orb uniforms and code from the pane shader; hover or selection makes a pane `panes.hoverOpacity` grey with `hoverEdgeAlpha`; `hovering` in `updateOrbs` and the selection orb no longer include planes. (2) Scroll: `scrollMode` ("auto" | "pan" | "zoom", `settings.input.scrollMode`, localStorage `cad.scrollMode`), `scrollPansFor(e)` classifies each wheel event (notch vs trackpad, per-gesture memory 160 ms, ctrl = pinch = zoom, Shift = pan), Safari `gesturestart/gesturechange` pinch, menu item cycles the mode. (3) `settings.sketch.oneShot`: `SketchSession#add` returns the tool to select after one figure (rectangle, circle, closed or finished line, also by typing). 89 tests (1 new). A syntax error from backticks inside the GLSL template string was caught by loading the page.
Browser: wheel deltaY 100 zoomed (120 to 146), small sideways fractional scrolls panned the target, ctrl + wheel zoomed; a selected XY pane is grey; R then clicks added one rectangle and the tool became select (a further click added nothing), C plus typed radius added one circle and went back to select; no console errors.
**Not yet:** the notch/trackpad guess is untested on real hardware (Linux libinput trackpads vary); no two-finger pan on a pen; pinch zooms about the cursor only for the mouse wheel path.

## Handoff 066 — 2026-11-05
**State:** `in_080`. `SketchSession#add` records `finished` ({ plane, id, closed }) for a one-shot figure; `takeFinished()`; `updateStatus()` calls `settleFinished()` which does `exitSketch(false)` and selects a closed figure (sel kind sketch). `selectObjectFromHover`: a double-click on a sketch shape calls `enterSketch(plane, "select")` (was: select the body). CSS: `-webkit-tap-highlight-color: transparent`, `-webkit-touch-callout: none`, `user-select: none` on `*`, `html`, `body` (the likely cause of the blue flash on a phone: the browser highlights the tapped element, which is the whole canvas). 89 tests.
Browser: C, click a pane, typed radius, Enter: the circle was added, no sketch state, the circle selected, status "Selected: sketch shape"; double-click on the circle opened it for editing; Esc left; no console errors.
**Not verified on a real phone:** the blue flash (I cannot reproduce a browser tap highlight in headless Chromium); if it persists, tell me what it looks like (whole screen vs the canvas, after a tap or a long press).

## Handoff 067 — 2026-11-05
**State:** `in_081`. `repivotOrbit()` (called when an orbit gesture really starts, mouse and one-finger touch) finds the body's box centre (`body.info.bbox`); if it projects inside the view and is at a sane distance it becomes `orbitPivot` and `orbitBy` eases `view.target` and `view.dist` toward it by `view.orbitEase` (0.2) per drag step; cleared on pointer up and touch up. Skipped when the camera is orthographic, no body exists, or the centre is off screen. Settings `view.orbitAroundObject`, `view.orbitEase`. A first version moved the target onto the line of sight at the model's depth; that did not keep an off-axis model still, so it was replaced by the easing. 89 tests.
Browser: a 40 x 30 x 25 box moved 150 along X, view target set beside it: before the orbit its centre was at screen (309, 412); after a right-drag orbit it was at (501, 320) (the screen centre) with the target at the box centre (183, 29, 12); no console errors.
**Risks / not done:** a very short drag only eases part of the way; with several separate bodies the pivot should be the nearest body in view (there is one body today); sketches alone (no body) still orbit about the old target; I have not tried this on a phone yet.

## Handoff 068 — 2026-11-05
**State:** `in_082`. `repivotOrbit()` stores the pivot's centre and its coordinates in the camera frame (`cameraFrame(a, e)` returns eye, forward, up, right from the camera model); `orbitBy` changes azimuth and elevation, rebuilds the eye so the pivot keeps those frame coordinates, and sets `view.target = eye + dist * forward` (distance unchanged). Removed `view.orbitEase`. 89 tests.
Browser: the box panned off-centre (centre at screen 309, 412) stayed at (309, 412) after a long right-drag orbit while the target moved to (123, 72, 27); no console errors.
**Not done:** a very large drag past the elevation limits is clamped, so the model's position holds only while the angles move; several bodies; not tried on a phone.

## Handoff 069 — 2026-11-05
**State:** `in_083`. (1) Counts: `onPointerUp` now calls `normalToClicked()` on the 2nd click and `selectObjectFromHover()` on the 3rd (status texts and README table updated). (2) `pickSketchElement(x, y)` (per unextruded sketch: ray to its plane, `elementAt` with `selectTolPx / pxPerMm(p, plane)`; `pxPerMm` now takes a plane) feeds `hoverAt` (`skel`), `hoveredSkEl`, `hoverAsSel` kind `skel`; the hover highlight is drawn in `buildSketchViz` also in 3D; `selectFromHover` on a `skel` does `enterSketch(plane, "select", 1, true)` (new `keepCamera` flag) and `session.click(p)` so the element is picked. 89 tests.
Browser: after a typed rectangle, a click 3 px from a corner opened the sketch with `point:e_001.p1` picked and the camera unchanged; a click on an edge picked `seg:e_001.s0` and the length pill (LEN 40) showed in a screenshot; 1 click selected the shape; 2 clicks turned the view square to the plane (a -1.57, e 1.57); no console errors.
**Not done / watch:** the third click selects the body from `hoveredFace`, so it only works when a body face or line is under the pointer; hover feedback for sketch parts is blue like in the sketch view (the teal is for faces); sketch parts of extruded steps (a step's own sketch) are still edited from the History list; `hoverInfo()` does not expose `skel`.

## Handoff 070 — 2026-11-05
**State:** `in_084` recorded (a question: does "no sketch isolation" make sense). Answered yes and wrote the proposal as the provisional entry `dec_no_sketch_isolation` (three stages: no mode and mixed selection; constraints to body corners as external anchors projected into the sketch plane; sketch-to-sketch only through projected points). No code changed. Waiting for the human to approve before building stage 1.
**Why the mode still exists today:** the session works on one sketch at a time (`session.plane`, `session.key`), constraints are stored per sketch key (`store.cons`), picks are refs inside that sketch ("e_001.p1"), and the solver is a 2D solve per sketch; body corners have no ids that a constraint could name.

## Handoff 071 — 2026-11-05
**State:** `in_085`: `dec_no_sketch_isolation` is accepted (stage 1 now; stages 2 and 3 one at a time), new accepted `dec_constraint_ownership`. Code: (1) `src/constraintmap.mjs` (`buildMap`, `constraintsOn`, `dependentsOfShape`, `brokenConstraints`, `partExists`) with 3 tests; `SketchStore.dependentsOf` and `remove` now take the shape's constraints with it (`cmd.consRemoved`, restored on undo); `SketchSession.constraintsOnPicks()`, `takeNote()` and a flash "N constraints that used it were removed". (2) No isolation in `main.js`: `otherTargetAt()`; in the sketch view with the select tool a click that is not on the edited sketch's own parts goes to whatever else is there (another sketch's part: `enterSketch(.., keepCamera)` and pick; a face, plane, body corner or line: `exitSketch(false)` then `selectFromHover`), the same things light up on hover (`setHover` while sketching, orb allowed with the select tool, cursor), `hovIn3D` also for other planes' sketch parts. 92 tests.
Browser: two sketches on the XY and XZ panes: clicking A's corner opened A with the corner picked, clicking B's corner while in A switched to B with that corner picked; a cube with a small square on its top face (plane F1): clicking the small square's corner opened it, clicking the cube's corner while sketching selected the vertex (status "Selected: corner"), clicking the square's corner went back; no console errors.
**Not done (stage 2):** shift-click mixing a sketch part and a body part in one selection; constraints to body corners (external anchors); showing a part's constraints when clicked beyond the existing pill icons; the map only covers one sketch's own constraints today.

## Handoff 072 — 2026-11-05
**State:** `in_086`: stage 2 of `dec_no_sketch_isolation`. New: `planeUV(plane, p)` in `viewmath.mjs`; constraint kind `anchor` ({ p, at: [u, v], ext: { kind: "vertex", world, lost? } }) expanded by `sketchsolve.expand` to a solver `fixed` at `at` (ignored when lost); `SketchSession.ext` (set from `applySel` when a body corner is selected), `#allOffers()` adds "Coincident with the body corner" for one picked sketch corner plus `ext` (toggle off when the same, replace when another body corner), `relatedAnchor()`; `SketchStore.refreshAnchors(resolve)` (derived, no undo) re-finds the corner after a rebuild (`resolveAnchor` in `main.js`, `sketch.anchorTolMm`), only for loose sketches; `constraintmap` addresses body corners under key "body" (`bodyRef`) and flags lost pins as broken; `main.js`: Shift + click a body corner while sketching sets `sel` to the vertex, Esc lets go of it first, an amber disc shows where a clicked pin holds its corner, the status line counts pins on a selected body corner (outside a sketch); icons/help for the new label. 96 tests (4 new).
Browser: a 40 x 30 x 30 cube with an 8 x 8 square on its top face: clicking the square's corner picked it, Shift + click on the cube's far top corner selected that corner (`session.ext` set), the menu offered "Coincident with the body corner", and after clicking it the square's corner was at (54.77, 44.77, 30), exactly the cube corner; one `anchor` constraint stored; no console errors.
**Not done:** pins to body lines; distance, horizontal and vertical to a body corner; seeing "pinned to" on the cube corner beyond the status count; repairing a lost pin; the follow-the-body refresh is covered by a unit test but I did not edit the cube in the browser to watch the square follow; stage 3 (between sketches).

## Handoff 073 — 2026-11-05
**State:** `in_087`. (1) **Many body lines selected and operated on together:** `shiftSelect()` (Shift + click on a body line toggles it in `sel.edges`, a corner is single), `updatePickViz` draws them all, `startEdgeMod(mode, edges)` makes one step with an array `ref`, the kernel `edgeMod` takes one ref or an array (kernel test: two parallel lines chamfered and filleted, closed-form volumes), history label "Chamfer 3 lines", rebuild finds every selected line again, status "Selected: 3 lines". (2) **Sketch line with body line:** `session.ext` is now `{kind: "vertex", world}` or `{kind: "edge", a, b}`; offers "Parallel to / Perpendicular to the body line" (constraint `extDir` with `seg`, `perp`, `dir` = the body line seen on the plane; blocked with a reason when it points straight out of the plane; its two ends are held near where they are with a soft length so the line turns about its middle); solver types `parallelDir` and `perpDir`; `refreshAnchors` and `resolveAnchor` now take the constraint and handle corners and lines. (3) **Solver fix:** the Levenberg-Marquardt damping scaled each variable by its own sensitivity, so a step with freedom moved the variables the constraint hardly touched the most (a line "turned" by being stretched to 134 mm); it is now the same for every variable (`dmax`). All earlier solver and sketch tests still pass. 99 tests (6 new).
Browser: a 40 x 30 x 30 cube: Shift + click on three top lines selected "3 lines" and B 3 Enter took the volume from 36000 to 35523 (history "Chamfer 3 lines 3 mm"); a triangle on the top face: its first side picked, Shift + click on the cube's front top line, menu "Parallel to the body line": the side became parallel to the cube line (v equal at both ends) with its length kept (18.9 vs 19.0); no console errors.
**Not done:** angle ("rotated") and distance constraints to body parts; faces in a shift-selection (and a face plus a line); multi-select of corners; two body parts related to each other; a selection panel listing the selected parts and their relations; sketch to sketch; the follow-the-body refresh for lines is covered by a unit test only.

## Handoff 074 — 2026-11-05
**State:** `in_088`. (1) **Cycling overlapping things:** `candidatesAt(x, y)` lists all body corners and lines within tolerance, all sketch corners/circles/lines (`elementsAt` in `sketchpick.mjs`, all within tolerance, corners first), sketch shapes, the body face and the panes under the ray, ordered corners, lines, faces (a sketch shape before the face it lies on); `cycleClick` takes the first on a click and the next on each repeated click within `input.cyclePx` of the same spot with the same candidate list, via `setHover(hover)` + `selectFromHover()`, and flashes "name: i of n here, click again for the next"; with one candidate the normal click counting applies (so on an overlap the double-click look-straight is replaced by cycling). (2) **Removed:** the N button (`compassN`), `originInfo`/`updateOriginPill`/`originBtn`, `exitBtn`, `scaleText`/`gridScaleText`, `selectionHint`, `anchorNote`; `updateStatus` now only shows a flash message or a kernel error (the `#status` box is hidden otherwise), no hints, prompts or states; `#history` is `display: none` (code kept: `updateHistory`, `editFeature`). 100 tests (1 new).
Browser: a cube with a small square on its top face: clicking inside the square cycled face, sketch shape, face, sketch shape with the message each time (first run; then I changed the order so the sketch shape comes first, not re-run); at rest `#status` hidden, no N button, no origin button, history hidden; no console errors.
**Watch:** with no prompts, typing guidance for extrude/move/rotate now only comes from the readout next to the cursor; editing a step from the history has no UI until the history is shown again; the click-count look-straight is lost on any spot with overlaps (e.g. a click on a body line also has its adjacent face under it); the sketch-view clicks do not cycle yet.

## Handoff 075 — 2026-11-05
**State:** `in_089` (a question about standardising relations and the plane they live in). Answered in chat and wrote the proposal as the provisional entry `dec_relations_standard`: one table of relations by pair of parts, geometric versus dimensional relations, measure-then-lock for every number, a fixed rule for the plane (solve in the plane of the sketch that moves; body parts are references; body parts become fixed virtual parts in the sketch's solve), and a build order (relations table, virtual parts, chip and missing solver types, later a 3D solver). No code changed. Waiting for the human to approve or change the plane rule (which of two free sketches moves).

## Handoff 076 — 2026-11-05
**State:** `in_090`. (1) Rule: first picked = mover, second = reference: `SketchSession#allOffers` gives every two-part offer `soft` anchors on the second pick's points (`held`), so the first moves; `#applyValue` for an angle now holds the second line and turns the first about the shared corner keeping its length (the lineui test was rewritten). (2) Multi-select bugs: `shiftSelectSketchPart()` (Shift + click on a sketch part in the 3D view enters that sketch with `keepCamera`, puts the selected body corner or line back and adds the pick with `shift: true`); a click on nothing in the sketch view (`selectclick`, no shift) also clears `sel` when it is a body corner or line. 101 tests (2 new).
Browser: a cube with a small square on its top face: cube corner then Shift + the square corner kept both (`picks: point:e_002.p1`, `sel: vertex`, `ext: vertex`); a click on nothing cleared both; square corner then Shift + the cube corner kept both; a click on nothing cleared both; no console errors. (A first attempt clicked the compass hit area at the bottom right and toggled it: that area is part of the click targets.)
**Not done:** Shift + click for faces and planes in a multi-selection; two parts from two different sketches (still one sketch at a time); the rest of `dec_relations_standard`.

## Handoff 077 — 2026-11-05
**State:** `in_092`: the relations table is started. New `src/relations.mjs` (pure): `ROWS` (rows with `pair`, `anyOrder`, `dimensional`, `unit`, `make`, `measure`, `unavailable`, `spot`), `relationsFor(picks)`, `dimensionalFor(picks)`; all earlier geometric offers moved into it and `sketchpick.offersFor` delegates; new dimensional rows: corner-corner distance, corner-line distance (`ptLineDist`), parallel-line gap (`lineGap`); solver cases `ptLineDist`, `lineGap` (two residuals); `sketchsolve.expand`; `sameDimension` also compares `p`, `seg1`, `seg2`; `valueFor` returns a `distance` chip (`distanceChip`); `SketchSession` uses `relation.unavailable` for offers, `valueChip` lock detection and a `distance` branch in `#applyValue` (the second pick is held softly); the pill label `DIST`; glyph text and icon for the new types. 106 tests (`test/relations.test.mjs` is new: the pair matrix, measure and make, order independence, typing a distance with the first as mover, unavailable for skew lines). A first `lineGap` with a single averaged residual let the line tilt; two residuals keep it parallel.
Browser: a 40 x 30 rectangle: clicking the bottom side and Shift + clicking the top side showed `DIST 30`; typing 50 moved the bottom side (first picked) down, the top stayed (height 50); no console errors.
**Not done:** angle between any two lines in the table, body parts as virtual fixed parts, the remaining relations (tangent, midpoint, on line, collinear, concentric), relations between parts of different sketches, 3D-only values; the pill chip is the only chip UI (the human has not decided the constraints UI).

## Handoff 078 — 2026-11-05
**State:** `in_093` (a question: rebuild clean?) and `in_094` (do not lose the xyz ideas, orbit about the object, the device world-view controls, the single, double, triple click interface). Answered yes to a planned rebuild (keep the solver, kernel, view maths, input mapping, relations table, ownership map, ring look and tuned values; rebuild the glue: `main.js`, the sketch session and store) with a written design first. Wrote the provisional `dec_interaction_spec` (the list of behaviours any rebuild must reproduce, by area, each traced to human inputs, plus what was deliberately dropped) as the acceptance list. Fixed two stale lines in the README (the compass still mentioned the removed N button). No engine code changed.
**Next, if the human agrees:** a short design for the clean engine: the one part interface, the keep and drop inventory of files, and the order of work (engine with no screen, minimal view, port features, cut over); the interaction spec is its acceptance list.

## Handoff 079 — 2026-11-05
**State:** `in_095`: wrote the design of the clean engine as the provisional `dec_clean_engine_design`: layers mapped to the human's (`inv_layer_adjacency`: Platform, UI, Interaction, Operation, Geometry compiler), the one part interface (ref, kind, origin drawn / body / world, plane as a field so "sketch" is not a thing, geometry accessors, per-kind pure functions), scene and relations (ordered parts, first moves), the actions service (relations table generalised to every operation), selection, one picking function with cycling, the click grammar in the input mapping, input as intents, commands and history, the compiler (virtual fixed parts for parts on other planes), the view, a keep, port, rewrite, drop table for every prototype file, eight phases each passing a slice of `dec_interaction_spec`, risks, and four open questions for the human (where the code lives, JavaScript or TypeScript, when to freeze the prototype, the drop list). No code changed. Waiting for the human to read and answer before any production code.

## Handoff 080 — 2026-11-05
**State:** `in_096` (a question about real apps on Android, Linux, Mac, Windows). Answered: no second language is needed (`dec_platform_web_portable` already plans one web codebase in a wrapper: Tauri or Electron for desktop, Capacitor or Tauri mobile or a PWA for phones); added section 13 to `dec_clean_engine_design` with the cheap things to do now (TypeScript, a DOM-free core with an import check, the Platform interface written in phase 1, the kernel kept in a worker behind its adapter, an early test on a real phone web view, OCCT LGPL packaging) and changed the proposed answer to open question 2 from JavaScript to TypeScript. No code changed.

## Handoff 081 — 2026-11-05 (build kickoff)
**State:** `in_099`: the four proposals approved, so `dec_clean_engine_design` is **accepted**: code in `app/`, TypeScript, prototype frozen at phase 4, the drop list stands. Done this session: `app/` scaffolded (`package.json` with `typescript` and `@types/node` as dev dependencies, recorded in `docs/licenses.md`; `tsconfig.json` strict; layer folders `app/src/{math,operation,compiler,interaction,ui,platform,shared}`; `app/test/`; `app/README.md`; `src/math/vec.ts` with one test as the toolchain check); `tools/check_layers.py` enforces the layer imports (`inv_layer_adjacency`: ui to interaction; interaction to compiler, operation, math, shared; compiler to operation, math, shared; operation to shared; platform to shared; math and shared import nothing), allows the browser only in `ui` and `platform`, and kernel libraries only in `compiler/kernel/occt`. Fixed the layer table order in the design to follow the blueprint. In `app/`: `npm test` (node:test on TypeScript, 1 test passes), `npm run typecheck` (passes), `npm run layers`. Roadmap updated.
**How to resume (CLAUDE.md session start applies):** read CLAUDE.md, this entry, `docs/roadmap.md`, then `dec_clean_engine_design` sections 2 to 10 and `dec_interaction_spec`; run `python3 tools/check_docs.py`, `python3 tools/check_layers.py`, and `cd app && npm install && npm test && npm run typecheck`.
**Phase 1 checklist (core, no screen; every item with tests in `app/test/`):**
1. `shared/`: `Ref` (a branded string), `Id` helpers, `Result`, the event bus type.
2. `operation/part.ts`: the part record (`ref`, `kind`: corner | line | circle | face | plane | axis | body, `origin`: drawn | body | world, `plane`, geometry, `movable`) and the per-kind registry of pure functions (`hit`, `outline`, `anchors`); a drawn corner, line and circle first.
3. `operation/scene.ts`: planes (world X Y Z and face planes), drawn parts, steps (extrude, edge mod on a set of lines, move, rotate, scale, delete), the relations list; JSON in and out (`prin_graph_is_truth`).
4. `operation/commands.ts` and `history.ts`: every change a command; undo and redo as a cursor over the append-only list (blueprint section 8); deleting a part removes the relations that used it in the same command (as the prototype now does).
5. `operation/ownership.ts`: derive who uses whom, broken relations (port `prototypes/cad-ui/src/constraintmap.mjs`).
6. `interaction/selection.ts`: the ordered selection (select, extend, toggle, clear, cycle) as pure functions; first = mover, second = reference; port the selection cases of the prototype tests.
7. `interaction/actions.ts` (start): the relations table by kinds of parts (port `prototypes/cad-ui/src/relations.mjs` rows, then the distances), returning label, enabled or why, measure, and `run -> command`.
8. Executable scenario tests for the selection grammar and the relations in `dec_interaction_spec` that need no screen.
Do not touch `compiler/` or `ui/` in phase 1. Keep porting honest: copy pure code from the prototype, convert to TypeScript, keep its tests.

## Handoff 082 — 2026-11-05 (clean engine, phase 1 done)
**State:** `in_100` (go-ahead after compaction). Phase 1 of `dec_clean_engine_design` is built in `app/`, headless, 27 tests passing, `tsc` clean, `tools/check_layers.py` OK (12 files). `compiler/` and `ui/` untouched.
**Built:** `shared/` (`ref.ts` branded `Ref` with `d/`, `b/`, `w/` origins and id formatting; `result.ts`; `events.ts` bus); `math/vec.ts` (add, scale, dist, mid, normalize); `operation/part.ts` (the one part record: corner, line, circle, face, plane, axis, body; same accessors for all; a registry of pure `hit`, `outline`, `anchors` per kind, implemented for corner, line, circle); `operation/scene.ts` (world parts O, X, Y, Z, XY, XZ, YZ rebuilt on load; drawn parts, relations, steps; counter so ids are never reused; JSON in and out saves drawn parts only); `operation/commands.ts` (add/move/delete part, add/remove/set-value relation, add/remove step, batch all-or-nothing; deleting a part takes the parts built on it and the relations that used it in one command; steps that lose parts stay and are reported broken); `operation/history.ts` (cursor over commands with snapshots; replay); `operation/build.ts` (draw chain, rectangle, circle with fresh ids); `operation/ownership.ts` (who uses whom, touching a part incl. its corners, deletion effect, broken); `interaction/selection.ts` (select, extend, toggle, clear, cycle, `click` with cycling "i of n" and Shift grammar, mover and reference with references always second); `interaction/actions.ts` (the relations table by kinds, in 3D from the scene: horizontal, vertical, fix, coincident, same height, same across, distance for corner-corner, corner-line, line-line (needs parallel), angle (lines sharing a corner), equal length, parallel, perpendicular, equal radius; plus Delete; each with enabled or why, measure, spot, `run -> command`; the side of a gap or angle is stored so it does not flip).
**Decisions made on the way (flag if you disagree):** (1) the layer checker now lets `operation` import `math` (pure, imports nothing; noted in the design); (2) history drops the undone tail when something new is done after an undo (the blueprint's "append-only with a cursor" kept as a cursor, not branches); (3) Shift-click on an already selected part takes it out (`dec_interaction_spec`), and Shift on the same spot again swaps the last added part for the next candidate (my reading of cycling with Shift, not in the spec).
**Not in phase 1 by design:** moving a part with its relations (needs the compiler solver), extrude/round steps as operations, face/plane hit tests, `candidatesAt`.
**Next:** phase 2, the compiler: solve per plane with virtual fixed parts (port `solver/solver.mjs` and `sketchsolve.mjs` into `compiler/`), turn relations into solver constraints (horizontal, coincident, distance, lineGap, ptLineDist, angle, parallel, perpendicular, equal, fix), then the kernel graph from steps via the existing `src/kernel/` adapter. Note the prototype's solver is `.mjs`: copy into `app/src/compiler/solver/` and convert to TypeScript, keep its tests.

## Handoff 083 — 2026-11-05 (clean engine, phase 2 done)
**State:** Phase 2 (the compiler) is built in `app/src/compiler/`; 53 tests pass, `tsc` clean, layer check OK (18 files), docs check OK. No new human input this stretch beyond "continue with phase 2".
**Built:** `compiler/solver/solver.mjs` (the prototype's solver, unchanged) with `solver.d.mts` types and its test ported; `compiler/solve.ts` (`solveScene`: per plane, drawn corners are variables, everything else a relation refers to (body, world, other planes) is a fixed virtual part at its projection; the second part of a relation is held softly so the first moves; output is `movePart` commands, so undo works; conflicts name the relations and change nothing; relations on no plane are reported `unplaced`; horizontal means along the plane's first axis, on any plane); `compiler/graph.ts` (`buildGraph`: extrude of a closed loop of lines or a circle, edge round/bevel of several body lines at once, move/rotate/scale, delete; `loopOf` orders lines into a loop or says why not; errors by step id); `compiler/body.ts` (body parts from the kernel result: corners, lines, flat faces as planes you can draw on; names carry position: `b/body/v@x,y,z`, `b/body/e@a~b~mid`, `b/body/f@n,d`; `decodeEdge` lets a step find its lines from the name alone); `compiler/kernel/` (the OCCT adapter copied from the prototype under `occt/`, typed interface in `adapter.ts`, `index.ts` the one place a kernel comes from; `replicad` and `replicad-opencascadejs` added to `app/package.json`, licenses already recorded, `docs/licenses.md` now lists `app/`); `compiler/compile.ts` (solve, graph, kernel, body parts back into the scene); `operation/scene.ts` `withBody`; `Line.mid` for curved body edges.
**Decisions made on the way (flag if you disagree):** (1) stable names for body parts use the position form only for now (`dec_stable_references`' named form is still planned): a part whose position changes loses its name and any relation or step using it is reported broken, not guessed; (2) the kernel conformance suite was not duplicated: the kernel files are byte copies, but its test still lives in the prototype; port it into `app/test/` when the prototype is frozen; (3) full round faces (posts, holes) are not yet body parts (cylinder radius/taper steps wait for phase 6); (4) a drawn part on a body face needs that face's plane added to the scene by its name first (phase 3 will do this when the face is picked).
**Next: phase 3, the picking contract:** `candidatesAt(pointer, view, scene)` over drawn and body parts (corners, then lines, then faces and planes; a shape before the face under it), with hover = first candidate and cycling already in `interaction/selection.ts`. Needs face and plane hit tests (project the outline polygon, point-in-polygon, nearest by depth) and the mesh triangle ranges of the kernel result for body faces. Then phase 4 (minimal view; freeze the prototype then).

## Handoff 084 — 2026-11-05 (clean engine, phase 3 done)
**State:** Phase 3 (the picking contract) is built; 61 tests pass, `tsc` clean, layer check OK (20 files). No new human input beyond "continue with phase 3".
**Built:** `interaction/picking.ts`: `candidatesAt(scene, pointerView, options)` returns every part under the pointer, ordered corners, then lines (circles and axes with them), then faces and planes; nearest first inside a class (pixels for points and lines, distance along the pointer's ray for surfaces); ties by ref. `refsAt` feeds `selection.click` (cycling with "i of n" already works on it); `hoverAt` is the first. Drawn, body and world parts go through the same function. `operation/part.ts`: `PointerView` now carries an optional `ray`; plane and face kinds have `depth` (ray hits); a world plane is a pane of `PANE` = 20 mm from the origin along its two axes and can be hit from either side; a body flat face is a plane carrying its triangles (`mesh`, from the kernel result) so holes in a face are not hit; a derived face has its corners in order (point in polygon) or is a disk. `operation/loops.ts`: `loopOf` moved here from the compiler; `derivedFaces` and `withDerived` (a closed loop of drawn lines on a plane is a face, a circle is a disk; open chains are not; faces are rebuilt, never saved). `compile()` now returns the scene with derived faces and body parts.
**Defaults to review (not tuned):** pick tolerance 10 px for corners and 8 px for lines (`DEFAULT_PICK`; the prototype's `selectTolPx` was 8): the real values belong to the look and input settings in phase 4; the world pane size 20 mm is a placeholder for the starter panes.
**Known gap for phase 4/6 (the session object):** commands are applied to the history scene, which has no body or derived parts; the compiled scene has them. A relation to a body corner, or a drawn part on a body face, is only valid on the compiled scene (the tests add the body plane by hand). Phase 4/6 needs one `Session` that, after every command, recompiles and validates parts against the compiled scene (or lets the history scene carry the last compiled body parts). Decide it at the start of phase 4.
**Next: phase 4, the minimal view:** `ui/` with three.js and Vite for `app/` (add `three` and `vite` as dependencies; their licenses are already recorded for the prototype, add `app/` to the rows), world (axes, panes, compass), camera controller (port `viewmath.mjs` and the orbit-about-model rules into `interaction/camera.ts` as pure functions, draw in `ui/`), parts drawn from `outline`, hover ring and selection teal (`orb.js`, settings values). Then freeze the prototype (README says what it taught) and test on a phone web view.

## Handoff 085 — 2026-11-05 (clean engine, phase 4 done: something you can see)
**State:** Phase 4 (minimal view) is built and the prototype is frozen (notice at the top of `prototypes/cad-ui/README.md`). 74 tests pass, `tsc` clean, layer check OK (29 files), `vite build` works. Verified in a real browser (Playwright, software GL): the box demo draws; the ring follows the pointer on a face; a click fills the face with the teal and spreads from the click; Z looks straight at the plane (orthographic, X to the right); orbiting after panning keeps the model's centre at exactly the same pixel (656.24, 327.94 before and after).
**Run it:** `cd app && npm install && npm run dev`, open `http://localhost:5173/?demo=box` (without `?demo=box` it starts empty). `tools/preview.sh` still starts the prototype; cut-over is phase 8.
**Built:** `operation/history.ts` takes a `derive` function (every scene is already compiled: solved, body parts, derived faces), which closes the gap of Handoff 084; `interaction/session.ts` (history, selection and click state, hover, last compile outcome, message; `run`, `undoLast`, `redoLast`, `clickOn`, `hoverOn`); `interaction/camera.ts` (pure: orbit with a pivot that stays fixed on screen, pan, zoom, look straight with the plane's first axis to the right, N/X/Y/Z alternating front and back, blend for the 450 ms transition, frame, `projector` giving project and ray for perspective and orthographic); `interaction/surfaces.ts` (triangles for panes, body faces, loops, disks; ear clipping); `interaction/api.ts` (what the UI layer may use, since UI sits only above interaction); `shared/settings.ts` (the tuned look and view values copied from the prototype, unchanged); `compiler/kernel/web.ts` + `occt/web.mjs` (browser start of the kernel); `ui/orb.ts` (the prototype's orb shader, typed), `ui/view.ts` (three.js: world axes as short pencil lines, panes, drawn lines and corners, circles, derived faces, the body mesh and edges, ring on hover, teal on selection, the spreading fill), `ui/main.ts`, `index.html`.
**Temporary on purpose:** `ui/main.ts` reads mouse and keys directly (left-drag or right-drag orbit, middle-drag pan, wheel zoom, click select with Shift to add, X Y Z H keys, Esc clears, Ctrl+Z); phase 5 replaces it with the device tables and the click grammar (double click looks straight, triple selects the object). The kernel runs on the main thread (a worker comes with phase 6 when it matters). Not yet in the view: the compass in the corner, the starter panes' rounded look, the grid on the plane you look straight at, the menu and the number chips.
**Things to check by hand (I cannot judge feel):** hover ring size and colour on a real screen, the orbit speed, the transition time; they are the prototype's values in `shared/settings.ts`.
**Next: phase 5, the input layer:** `platform/` pointer, wheel, key and touch events into intents by device tables (mouse, trackpad, finger, pen); the scroll classifier; the click grammar with multi-click timing (`dec_interaction_spec`); long press menu; then `ui/main.ts` only draws. Still to do on the phone: test the view on a real Android and iPhone web view (`dec_clean_engine_design` section 13, item 5).

## Handoff 086 — 2026-11-05 (preview command for the app)
`tools/preview.sh` now defaults to the clean app (`app/`, opens `/?demo=box`); `LAN=1` still serves to a phone and prints the full address; `DEMO=0` starts empty; `bash tools/preview.sh cad-ui` runs the frozen prototype. It pulls the current branch first, so on the human's machine the checkout must be on `claude/inspiring-pascal-l342k7`.

## Handoff 087 — 2026-11-05 (clean engine, phase 5 done: the input layer)
**State:** Phase 5 built; 99 tests pass, `tsc` clean, layer check OK (35 files), docs check OK (106 human inputs: `in_101` to `in_106` recorded this stretch). Verified in a real browser with real mouse and touch events (Playwright, software GL): click selects; double click turns to a straight view of the plane (orthographic, from the side you are on); triple click selects the body (teal over the whole body); click on nothing clears; wheel notch zooms; right click opens the menu; right-drag orbits; X/Z keys alternate front and back; finger tap selects, one-finger drag orbits, two-finger drag pans, two-finger spread pinches in, long press opens the menu (and the menu stays open when the finger lifts).
**Built:** `shared/input.ts` (RawInput records and Intents); `platform/dom-input.ts` (DOM events to RawInput on the bus; the only place that touches pointer, wheel, gesture and key events; a timer tick while a finger is down); `interaction/recognizer.ts` (device tables: mouse and pen, finger, scroll classifier with a forced mode, Safari pinch, keys; multi-click counting by time and place, different limits for touch); `interaction/keymap.ts`; `interaction/controller.ts` (`reduce(state, intent)`: hover with the ring point; the click grammar (one selects, two look straight at the plane from the side you are on, three select the object; where several things overlap, repeated clicks cycle instead); right click selects what is under it and lists the actions that apply; `runAction`, delete, undo, redo, Esc closes the menu then lets go; X/Y/Z select that axis's plane and look along it alternating front and back, N the plane of the selection; zoom toward the surface under the cursor, out about the view centre; orbit about the model without re-centring; home; the camera animation); `camera.zoomAt`; `body.ts` now emits one whole-body part for the third click; `ui/menu.ts` (rows at the pointer, 44 px targets, with a "Scroll: ..." row that cycles auto, pan, zoom and is remembered in the browser); `src/main.ts` is the composition root (wires platform, recogniser, controller, view and menu; no decisions); `tools/check_layers.py` allows that root.
**Fixed on the way (found by tests):** picking counted surfaces and edges hidden behind the body, so a double click saw several things and cycled instead of looking. Now only the nearest surface counts plus anything flush with it (a shape on a face, a pane lying in a face), and corners and lines hidden behind a body face are not candidates. Previously X mapped to the XZ plane and Y to YZ in the temporary wiring; now X looks along the X axis (at the YZ plane), Y at the XZ plane, Z at the XY plane.
**Not built yet:** the menu has no draw tools or operations beyond what the actions table gives (relations and Delete); the corner compass, rounded starter panes and the grid on the plane you look straight at; a second pointer type test with a real pen; mouse `ctrl+click` as right click on a Mac; the hover ring still shows over a selected body (small thing to decide).
**Next: phase 6, drawing and operations:** menu entries Rectangle, Circle, Line (one figure, then back to select; typed sizes), Extrude (distance by typing or dragging), Round and Bevel for selected lines, Move, Rotate, Scale, with each one a command and undoable; surfaces in the menu (right click on a face offers Draw, Extrude...). Decide the drawing state machine in `interaction/tools.ts` before the view.
