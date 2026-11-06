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

## Handoff 088 — 2026-11-05 (clean engine, phase 6 done: draw and build)
**State:** Phase 6 built; 112 tests pass, `tsc` clean, layer check OK (40 files), docs check OK (`in_107`). Verified in a real browser: Z looks straight at the plane, right click on the pane opens the menu with Rectangle, Circle, Line; Rectangle, click, move (live Width and Height chip), click draws a rectangle and selects it; E then typing 15 and Enter extrudes it (volume 6300 = 30 x 14 x 15); C on the top face draws a circle, typing 8 and Enter, then E, -4, Enter cuts a hole (volume 6098.9 = 6300 - pi x 16 x 4); Ctrl+Z undoes the cut in one step.
**Built:** `interaction/tools.ts` (rect, circle, line: armed, first click on any surface sets the plane and first point, second click or Enter finishes; one figure then back to select with the new closed figure selected; typed sizes (rectangle width, Tab, height; circle diameter; line length) on the side the cursor is; snapping to a corner within 12 px, else rounded to 0.01 mm in the plane; a line closes by clicking its first corner, ends with a double click or Enter; a face of the body becomes a drawn plane copy so a sketch on it does not depend on the body's name staying the same); `operation/build.ts` `drawSquaredRectangle` (a hand-drawn rectangle keeps its sides level with the plane's axes by four relations, so it stays a rectangle when a corner is dragged or a size is typed); `interaction/operations.ts` (extrude of a closed figure: distance from the pointer along the normal or typed, negative cuts; round and bevel of selected body lines (default 1 mm, arrows change it by 0.1); move, rotate (default axis Z) and scale of the whole body with X Y Z choosing the axis; each is one step, one undo, and says why when it cannot start); `interaction/entry.ts` (the chip's fields and the preview lines); controller: `begin`, `typed`, tool and operation branches of click, hover, Esc (menu, then tool or operation, then selection), the menu now lists relations, the operations that can start from the selection, and the three tools; keys R C L (tools), E F B M T K (extrude, round, bevel, move, rotate, scale), digits . - Backspace Tab Enter and arrows typed; `ui/chip.ts`, preview lines in `ui/view.ts`, crosshair cursor while a tool is armed; `ui/menu.ts` draws dividers between groups.
**Fixed on the way:** body faces had a plane basis that made a floor's first axis point along -Y; now a floor or ceiling has X to the right (like the XY pane) and a wall has the basis of the world plane it is parallel to, so typed width and height go the way you expect.
**Choices to review:** keys T for rotate and F for round are mine (the prototype used R for both rotate and rectangle; R is rectangle now); no drag-to-draw (press, drag, release) yet, only click, click or typing; no live 3D preview of fillets or moves (a value chip only), extrude shows its prism as lines; a corner of the body hidden behind it cannot be clicked (so selecting all four vertical edges means orbiting between clicks).
**Not built:** moving or rotating a drawn closed shape; push or pull of a body face (faceExtrude is in the kernel but not in the graph builder); cylinder radius and taper; fillet of a drawn line; the corner compass, rounded starter panes, grid on the straight plane; kernel in a worker (it runs on the main thread; fine for these models, will stall on big ones).
**Next: phase 7, the relations UI:** show the relations on a selected part (from `ownership.touching`), the number chip to set or edit a distance or angle on a relation (the dimensional ones already measure and lock), delete a relation, highlight the other parts it ties; `dec_relations_standard` and `dec_constraint_ownership` apply. The human has not yet chosen the constraints UI: propose it (a provisional entry) before building, with the choices below.

## Handoff 089 — 2026-11-05 (clean engine, phase 7 done: relations you can see and edit)
**State:** Phase 7 built; 119 tests pass, `tsc` clean, layer check OK (43 files), docs check OK (`in_108`). Verified in a real browser: two rectangles drawn by typing; selecting a corner of each shows a dashed suggestion pill "Distance 6.32 mm" (the measure); D and typing 9 then Enter locks it (the first part moves, the second stays); the selection keeps its badge "9 mm" with a lock; click the badge's icon and it opens (label, the number, lock, x, amber outline); click the number and type 14 to change it; click the lock to unlock (the number becomes a measurement, the solver lets the part move); the x deletes it; no page errors.
**What I built from decisions already in the record (`in_058`, `in_060`, `in_061` icons with tooltips, click opens with an x, what it relates shows in amber; `dec_relations_standard` measure then lock):** `interaction/badges.ts` (`badgesFor`: the relations that touch the selection, including through the corners of a selected line or circle, with the stored number, live measure, unit, lock, broken flag and the parts they tie; `focusParts` for the amber ones; `suggestMeasure`; `anchorOf` for where the badges sit); `operations.ts` kinds `dimension` (the pair's number, measure then lock) and `edit` (change a relation's number); intent `relation` (focus, remove, lock, edit) and key D; state `focus`; Esc closes a badge before the selection; a click elsewhere closes it; `compiler/solve.ts` skips an unlocked number; `ui/badges.ts` (pills with icons from `ui/icons.ts`, ported from the prototype), amber highlight in `ui/view.ts`; the menu offers "Dimension" when the selection has a number.
**Not decided by the human, so provisional:** where the badges sit (next to the last selected part, a column) and the dashed suggestion pill. `dec_relations_standard` says the constraints UI is still the human's to choose; this is the "as it stands" version the design called for. Ask for feedback before building more (a panel, a list of all relations of a part, the relation graph).
**Not built:** the plane badge ("on XY") on a chip, angle and distance to body parts shown with a 3D value when the plane differs, a list of all relations in the file, step badges (an extrude that uses these lines), relation conflict display (the solver reports conflicts per plane; the UI does not show them yet), selecting a relation from the amber parts.
**Next: phase 8, cut over:** make the clean app the default (`tools/preview.sh` already runs it), move the prototype's kernel conformance test into `app/test/`, check the layers and docs, README for `app/`, phone check (real Android and iPhone web view for the WASM memory), save and load (file format: `toJSON` exists; the platform needs open and save, `dec_platform_web_portable`), and the roadmap. Then the next real features: the corner compass and starter panes, history panel, faces to push and pull, kernel in a worker.

## Handoff 090 — 2026-11-05 (clean engine, phase 8 done: cut over)
**State:** The eight phases of `dec_clean_engine_design` are built. 131 tests pass (`npm run check` in `app/` runs tests, type check and layer rules), layer check OK (45 files), docs check OK (`in_109`). `tools/preview.sh` runs the clean app by default; the prototype is frozen.
**Phase 8 built:** the project file (`operation/file.ts`: base scene, commands and cursor as plain JSON, body parts and derived faces rebuilt on open, damaged or newer files refused with the reason); `openSession`/`saveText`; `platform/web-files.ts` (download to save, file picker to open, local storage for the autosave; no File System Access API); Ctrl+S and Ctrl+O and Save and Open in the menu; autosave after every change with restore on reload (off with `?demo=box` so the demo never overwrites your work); the kernel conformance suite moved into `app/test/kernel-conformance.test.mjs` (9 tests, byte-identical kernel, passes); `app/README.md` rewritten (run, check, what you can do, layers, where things are); `npm run check`.
**Verified in a real browser:** draw by typing, extrude, reload (work comes back: same parts, same volume), Ctrl+S downloads `model.cad.json` (1.7 KB), undo to nothing, Ctrl+O reads it back (same volume). Kernel ready in about 1 s on this machine; JS heap about 33 MB (the OCCT WASM, about 23 MB, sits outside it).
**What only the human can check:** the real phone check (`dec_clean_engine_design` section 13, item 5): open `LAN=1 bash tools/preview.sh` on an Android phone and an iPhone and see (1) the kernel loads (the WASM is about 23 MB), (2) a box extrudes, (3) one-finger orbit, two-finger pan and pinch, long press menu feel right, (4) no crash after a few operations. Report what happens; the WASM memory cap on phones is the risk, and the fix would be a smaller kernel build or the kernel in a worker.
**Still open (decisions for the human):** `dec_interaction_spec` is still `provisional` (never confirmed); the constraints UI beyond the badges; the hover ring over a selected body; key choices (T rotate, F round).
**Next real features, in the order I would do them (propose, then build):** (1) the corner compass and the rounded starter panes (the look the human liked); (2) the grid on the plane you look straight at; (3) kernel in a worker so big models do not freeze the page; (4) a history panel (the additive history exists: show it); (5) push and pull of a body face (`faceExtrude` exists in the kernel), cylinder radius and taper; (6) move and rotate drawn closed shapes; (7) conflicts shown in the UI; (8) named stable references for body parts (`dec_stable_references`), which makes sketches and relations on body faces survive more changes.

## Handoff 091 — 2026-11-05 (the old look back, line length, constraint delete)
**State:** `in_110`. 139 tests pass, `npm run check` clean, layer check OK (48 files), docs check OK.
**Why length and delete were missing:** the new table only measured between two parts, so a single line had no length; and the constraint x only appears after you click a badge's icon (as the old one did), while a freshly drawn shape selects its face, which showed no badges. Fixed: **Length** for a line and **Diameter** for a circle are in the table (suggestion pill "Length 14 mm", D to type it, locked as a relation the solver enforces); a selected closed figure now shows the badges of all its lines; the x is there once a badge is opened (click its icon); the relation can also be unlocked or have its number edited there.
**The old look, restored from the prototype's screenshots and `settings.panes`:** `ui/world.ts` draws short charcoal axes with arrowheads and X Y Z labels (an axis pointing at you loses its arrowhead and label), three rounded panes floating out from the axes (they brighten on hover), the corner compass (the same axes small, bottom right, with X Y Z buttons beside it) once there is a body, a click on the compass sends the big axes back to the origin and again to return (a faint copy stays in the corner), and the faint grid on the plane you look straight at (steps 1, 2, 5 times ten to the n, about thirty lines across, every fifth heavier); the ⋯ menu button top right for a phone. Colours are now taken as screen colours (before they came out too light). Starter panes can be picked only until there is a body; after that the compass buttons and X Y Z keys choose a world plane, and a tool with a plane selected draws on it without needing to click a surface.
**Verified in a browser:** start screen next to the old prototype's; hover ring on a pane; grid after Z; draw a rectangle by typing, click a line (Horizontal badge and Length 14 mm pill), D 20 Enter locks it (relation `length 20`); extrude, compass in the corner with X Y Z buttons; click the compass and the axes return; no page errors.
**Not matched yet:** the old pane fill under a selection is square (the new one fills the pane's square, not its rounded shape); the compass flight animation is a cross-fade, not a move into the corner; the corner compass buttons are my layout. Say what still differs and I will match it.

## Handoff 092 — 2026-11-05 (fresh start, delete, the old model look, compass flight and layout)
**State:** `in_111`. 144 tests pass, `npm run check` clean, layer check OK, docs check OK. Handoff 090's autosave is **removed** (`in_111`): every load starts empty; Ctrl+S and Ctrl+O still save and open a file; README updated.
**Delete:** select what you want gone and press Delete (or choose Delete in the menu). A drawn closed figure goes with its corners, so nothing is left behind, and its relations go; a line, a corner or a circle goes with what is built on it; the whole body (click it three times, or any way you can select it) goes as one step that undoes. New command `deleteParts` (several at once, a part an earlier one took is not an error). Deleting a figure that an extrude used leaves that step broken (reported by the ownership map, not shown yet).
**The old model look (from the prototype's `body.js`):** the body is a grey physical material with a slight clear-coat sheen and a soft studio reflected in it (`settings.light`, copied), its outline is drawn from the mesh where faces meet at more than 30 degrees in a thin line, corners of the body are not dotted, and a hovered or selected corner is a teal ball sized by view distance (`settings.pick.vertexScale`); picked lines are 2.4 px, hovered 1.8 px. What an extrude has used up (its lines, corners and the figure's face) is no longer drawn or picked while the step uses it, and an extrude leaves nothing selected, so the new body shows grey and not teal.
**Compass:** the axes now fly between the origin and the corner (0.7 s, eased): one copy of the axes is drawn in a rectangle that moves and shrinks from where the big axes are to the corner; the first frame never flies. The X Y Z buttons stand at the right viewport edge (lower right) and the compass is to their left. Checked in a browser with frames taken during the flight.
**Still to compare with the old one (tell me):** the hover colour and pane fill; whether the drawn lines should be thicker; the compass arrowhead proportions.

## Handoff 093 — 2026-11-05 (focused cleanup)
**State:** `in_112`, `in_113`. 144 tests pass; `npm run check` now also runs `npm run unused`. Same behaviour, verified again in a browser (draw, extrude, delete the body, delete the figure, reload starts empty).
**Measured honestly before:** the old prototype is about 5,580 source lines (its `main.js` 2,576), the app about 4,120 (largest file 313); the app has 144 tests against 110 but also does less (no push and pull of faces, tilt, radius and taper, moving drawn shapes yet).
**Done:** (1) `tools/check_unused.py` (new, part of `npm run check`): functions and values exported but unused, files nobody imports, and names in the UI's window `interaction/api.ts` that the UI never uses; (2) the 313-line `controller.ts` is now 40 lines of dispatch plus `interaction/control/` (`state`, `viewing`, `pointer`, `modal`, each under 125 lines); (3) `compiler/solve.ts` `solvePlane` (108 lines) split into `newModel`, `constraintFor` (relation to solver constraint, one case each) and a short loop; (4) dead code removed: `partOf`, the `Recognizer` type, the kernel worker file nothing used, 20 unused icons, the browser's local storage is now used through `webStore` (the scroll mode), 11 names no longer re-exported to the UI; (5) 15 functions that were exported but only used in their own file are no longer exported; (6) the kernel README now describes the app's kernel folder instead of the prototype's; (7) a fix found while checking: after the body is deleted, the figure an extrude had used shows and picks again.
**Not done (honest):** `createView` (217 lines) and `createWorld` (193) and `createRecognizer` (157) are long factory functions with nested helpers; splitting them into smaller files would be the next cleanup but changes more. Interface and type exports that nothing imports were left (they are API surface, not code). `main.ts` still holds the wiring of menu rows for save, open and scroll mode.

## Handoff 094 — 2026-11-05 (the rest of the cleanup)
**State:** `in_114`. 146 tests pass, `npm run check` clean (tests, types, 66 files follow the layer rules, no unused code). Behaviour unchanged: the browser scripts for mouse and touch input, drawing and extruding, relations, delete and fresh start all pass, and the start screen is pixel-for-pixel what it was.
**Done:** (1) `createRecognizer` (157 lines) is now 30 lines composing `interaction/input/` (`clicks`, `scroll`, `mouse`, `touch`, `keys`, each one device or concern); (2) `createWorld` (193) is now 60 lines composing `ui/world/` (`parts` axes and labels, `panes`, `compass` with the flight, `grid`); (3) `createView` (217) is now 78 lines composing `ui/view/` (`pen` helpers, `content` the scene, `highlight` ring and teal and amber, split into small functions); (4) the decisions in `main.ts` moved into the interaction layer: `interaction/frame.ts` (`frameOf(state, size)`: one plain description of what to draw, including whether the big axes or the compass show, which plane's grid, whether badges give way to a tool) and `interaction/appmenu.ts` (Save, Open and the scroll mode rows); `main.ts` is now only wiring and drawing; (5) `tools/check_unused.py` follows the UI's subfolders; two small tests for the frame and the menu rows.
**Longest function now:** 78 lines (`createView`); next are `apply` in `operation/commands.ts` (66, one case per command), `attachInput` (62, one listener per event kind) and `actionsFor` (62): each is a flat list, left as is. Largest file: `interaction/actions.ts` (259, the relations table).
**Remaining honest gaps:** the old `selection` hover ring over a selected body; `actions.ts` mixes the table rows and the code that builds actions from them (splittable into `rows.ts` and `actions.ts`); the view model `frameOf` is computed on every dirty frame (fine now, profile before optimising).

## Handoff 095 — 2026-11-05 (one look for lines and corners, inline constraints, 3D extrude preview)
**State:** `in_115`. 148 tests pass, `npm run check` clean. Browser check: sketch, inline constraint row, length 30 locked, row opened (number, lock, x), extrude preview as a lit translucent solid, extrude committed by click: nothing selected, nothing hovered.
**One look for every line and vertex:** `ui/view/content.ts` draws every line and circle of the scene (drawn parts; the body's outline from its mesh) with the same thin charcoal line from one material; drawn lines were thick black before and had black dots. Corners are no longer dotted anywhere: a corner shows as a teal ball when you point at it or pick it, the same for a drawn corner, a body corner and the origin. While a tool is armed a small teal ball marks where the pointer is on the plane. The `sketchInk` setting and the dot helper are gone. (Not yet unified in code: the body's outline comes from its mesh at a 30 degree threshold, because kernel edges include seam lines of round faces; drawn lines come from the line parts. Both are the same line in the same material.)
**Constraints as before (`in_058`..`in_061`):** one row at the left of the selected part: an icon for each relation, and for a dimension just its number (a length reads `30`); click one and it opens with the number (click to type a new one), a lock and an x that deletes; what it ties the selection to is amber; a measurement you could lock shows as a dashed number in the same row (click or D). Tooltips carry the words.
**Extrude in 3D:** while you set the distance the preview is the solid the extrude would make (sides and both caps, lit, translucent teal) with its outline, for any closed figure or circle, and updates as the pointer moves or you type; cut (negative) shows the same solid going into the body.
**After an extrude:** nothing selected (as before), and now the hover and the spread of the earlier click are cleared too, so no ring is left on something that is no longer under the pointer.
**Not done:** the preview solid is geometry, not the kernel's result (no booleans shown for a cut); `Line.pts` for curved body edges (so they can be picked along their curve) is still to do.

## Handoff 096 — 2026-11-05 (infinite panes, real extrude preview, gray material, length of body lines)
**State:** `in_116`. 149 tests pass, `npm run check` clean. Browser check: a click far from the axes picks the XY plane; the extrude preview is the real gray body (steps stay 0 until Enter); a body line shows its length.
**Panes:** the three world planes are now infinite (`Plane.infinite`): a click on empty space on load picks the plane anywhere, and the hover ring follows the pointer on it. They are drawn almost transparent (opacity 0.05, a little brighter under the pointer or when picked, never blue, nothing filled when picked). An infinite plane is only a candidate where nothing else is under the pointer, so a figure drawn on it is not always "overlapping" it. They still go away once there is a body (the compass buttons and X Y Z keys choose a plane then). Consequence: with only panes in the scene there is no empty click, so Esc is how to let go of a picked plane.
**Extrude shows the real thing:** while any operation's number is being set (extrude, round, bevel, move, rotate, scale, even a dimension) the picture is the scene as it would be after it, compiled by the kernel, so an extrude is the normal gray body, a negative one the body with its hole; nothing is done until Enter or a click (`previewCommand`, remembered for the same command). The translucent teal prism is gone. The kernel runs on the main thread, so a very heavy model would make dragging the distance slow (worker later).
**Material:** gray, slightly diffuse and glossy: roughness 0.5, clear-coat 0.3 at 0.45 roughness, soft studio reflection 0.35, body color a little darker (`settings.light`, `theme.bodyColor`).
**Why a line showed nothing:** a line of the body has no relations and every part is a reference, so the table refused to offer its length. A line (or two corners) of the body now shows its length as a dashed measurement that cannot be locked (tooltip says so). A sketch line before an extrude showed its row as before; after an extrude the sketch is hidden (used up), so only the body's lines can be picked.

## Handoff 097 — 2026-11-05 (helper handles, one fillet / chamfer, triple click, no grid)
**State:** `in_117`. 155 tests pass, `npm run check` clean. Verified in a real browser with the mouse: a quick triple click selects the body and the view never turns; a double click turns to the plane after the click window; Move's X arrow dragged 12 mm (the body moved, the move stayed open); the edge's double arrow dragged out 3 mm gave a live "Fillet 3 mm" and committed a fillet; the Z curved arrow dragged a quarter turn committed `rotate 90` about the centre.
**Grid:** off (`settings.grid.show = false`); the code is kept, one flag turns it back on.
**Triple click:** a double click now waits for the click window (`multiClickMs`, 400 ms; taps 550) before turning the view; a third click inside it cancels the turn and selects the object, so there is no flash of the straight-on view. (`pendingLook` in the state, fired by `advance`.)
**Helper handles (`interaction/gizmo.ts`, `control/handles.ts`, `ui/view/gizmo.ts`):** Move: arrows along X Y Z from the body's middle; drag one (the body moves that way live, the real kernel result), let go: one `move` step, and the move stays open for another drag (Esc or Enter ends it). Fillet / chamfer is now one operation (F or B or the menu): a double arrow through the middle of the selected edge, pointing out of the corner (the two faces that meet there added); drag out and it is a fillet of that size, in and it is a chamfer of that size; the chip says which; typing works too (a minus makes a chamfer). Rotate: three curved arrows, one round each axis, and a ball at the centre; drag an arrow to turn the body about that axis through the centre (snaps to 0.5 degrees); drag the ball to put the centre where you want it, and it sticks to a corner you point at; the turn is a `rotate` step with the pivot (`px py pz` in its params; the kernel's rotate takes a `pivot`). Handles are sized to the view (`settings.gizmo`), charcoal, teal under the pointer or while dragged; while they are up the body is not tinted by its selection. A drag that does not begin on a handle still orbits; a click leaves the operation open.
**Input:** an `orbit` intent now carries where the pointer is, and `dragEnd` says the pointer went up after a drag (mouse and one finger); a drag that starts on a handle is told apart from a camera drag at its first move.
**Removed:** the separate Round and Bevel operations and their B key (B now also starts Fillet / chamfer); the default 1 mm size.
**Not done:** the double arrow for several edges at once uses the first selected edge's place (the size applies to all); scale has no handle (typed); no handles for moving or rotating a drawn shape; the handles cannot yet be dragged by a finger on a phone (a one-finger drag that starts on one works through the same path, untested on a device).

## Handoff 098 — 2026-11-05 (constraints shown on the parts, infinite sheets, build stamp)
**State:** `in_118`. 154 tests pass, `npm run check` clean. Browser check: a face shows no bubbles; the bottom line shows its Horizontal icon and a measured length; both lines show each their own and an angle arc with `90`; typing 45 in the length makes `length 45` locked; clicking a bubble opens it (x appears) and clicking again closes it; no page errors.
**Your edits not showing:** I cannot see your machine; the likely cause is the page running an older commit (the preview pulls the branch you have checked out). New: the right-click menu ends with a row **Build <commit> <date>** so you can tell which commit the page is running, and the preview script prints the commit too. The latest on the branch is the one in this entry's commit. If the Build row is older, run `git pull` on `claude/inspiring-pascal-l342k7` and restart the preview.
**Constraints belong to what they constrain (`interaction/annotations.ts`, replaces the badge row):** a line shows its line constraints, a vertex its vertex constraints, a face or plane none; each constraint is one bubble placed where it means something: on the line (horizontal, vertical, length), at the vertex (fixed, coincident), between the vertices (same height, distances), in the space between two lines (parallel, equal), where two lines would meet if extended (perpendicular), as a small arc round the shared corner with the degrees (an angle), and a distance between two things as the segment it measures. A constraint between two selected parts is shown once; every selected part shows its own, so two lines show both. Nothing follows the pointer. Bubbles at one spot are laid side by side.
**Bubble (`ui/bubbles.ts`):** a dimension is just its number and a little lock (dim when unlocked); no box icon or dashed outline. Click the number to type over it (a real box, Enter keeps, Esc cancels); click the lock to lock or unlock; click the bubble to open it (an x to delete) and click again to close (the bug was that the open and close listeners were added each time the bubble was redrawn, so a click toggled twice); the x also shows on hover. The measure of a selected line or pair that is not locked yet shows as a bubble too: type a number in it to lock it.
**Removed:** the `edit` operation and intent (the number is typed in its bubble), the old badge files.
**World planes:** now drawn as infinite transparent sheets (huge, fading out with distance from where you look, a little brighter under the pointer or when picked) instead of the small rounded squares; a click anywhere on empty space picks one and nothing turns blue. The straight-on grid stays off. Opacity is `settings.panes` (0.035; 0.09 hovered).
**Fillet / chamfer handle:** the double arrow is about half as long and its heads about half the size.
**Not done:** a distance between a corner and a line draws the segment but its bubble sits at the segment middle; relations between parts on different planes have no special placement; the 3D placement does not avoid overlapping other geometry.

## Handoff 099 — 2026-11-05 (handles by themselves, push / pull, scale and shape handles)
**State:** `in_119`. 161 tests pass, `npm run check` clean. Browser check (real mouse): click the body three times and its X Y Z arrows appear with no menu; dragging one moves the body and the arrows travel with it while you drag (the chip says `Move X 12 mm`); the move ends with the drag and the selection stays so you can drag again; click the top face and its normal arrow appears, dragging it up 6 mm took the volume from 16000 to 20800 (push / pull, one `pushPull` step) and left nothing selected; T shows three full circles with arrowheads; a click in blank space leaves the operation; K shows the scale ball. No page errors.
**Handles by themselves from a click (`autoOp`):** a drawn closed figure shows the arrow to pull it out (an extrude); a flat face of the body shows the same arrow to push or pull it; lines of the body show a double arrow on each for a fillet (out) or a chamfer (in); the whole body shows X Y Z arrows. Menu and keys still start them (E, M, T, K, F; the menu has Push / pull). Typing a number while a handle is showing is the same as dragging it that far (select a face, type 4, Enter). A handle that showed up by itself ends with its drag; one you started stays open for another drag.
**Push / pull:** new step `pushPull` (the kernel's `faceExtrude`): out adds material, in cuts it; the face is found by its name and a point on it from its triangles. Extrude with the pointer pulling and a click committing is gone: the arrow (or typing) does it.
**Live follow:** the arrows of a move or a pull travel with what they drag (`followed`); rings and the edge arrows stay put.
**Rotate:** each axis is a full circle (the plane it turns in is plain), one arrowhead for the direction; the ball at the centre places the pivot on a corner you point at.
**Leaving an operation:** a click anywhere but on a handle, blank space too, leaves an operation you started and then acts as a normal click (a click on nothing also lets go of the selection); Esc as before.
**The earlier not-done items:** several edges each show a double arrow and the size dragged on any applies to all; Scale has a handle (a ball at the body's far corner on a line from its middle: pull it out for bigger, the factor is the distance along that line relative to where you took hold); a drawn figure can be moved (arrows along its plane, one step-free change of its corners) and turned (a ring round its normal, a placeable centre); turning releases the corners fixed and the sides held level so the shape can turn, moving releases fixed corners; the phone: touch uses the same intents as the mouse (`orbit` with positions, `dragEnd`), but I still cannot test it on a real phone, please try a drag on a handle.
**Not done:** scale for a drawn figure (a circle's radius has no command yet); a body face that is curved has no push / pull; a handle for several faces; the arrowheads are small on screen at some angles (tell me the size you want).

## Handoff 100 — 2026-11-05 (transparent planes, small axes, conflict feedback, the open list)
**State:** `in_120`. 161 tests pass, `npm run check` clean. Browser check: a square with its angle locked at 90, typed 60 in the angle bubble: refused, the horizontal and vertical sides' bubbles and lines flash red and fade, the angle bubble shakes, the number goes back to 90 and nothing moved; the status line says why.
**My reading of "the xyz thing ... leave it there" (tell me if wrong):** the three axes at the origin are small (7 percent of the view distance, so they stay small on the screen), thin and semi-transparent (opacity 0.55) and stay where they are; the corner compass that flew in is removed (code, intent, tests); the X Y Z buttons stay at the lower right. The world planes are truly transparent: nothing is drawn for them, you pick one by clicking on empty space (the hover ring shows where). Settings: `world`, `buttons`.
**A refused change:** `run` now compares the compile result before and after a command; if it newly cannot be solved the command is refused (the history and the picture do not change, the status says "that cannot be done without breaking other constraints") and the session keeps `conflict` (the relation ids the command added or changed, and the constraints that are in the way). The controller starts a flash (`flash`, 1.1 s); `frameOf(state, size, now)` carries it: the broken constraints are shown red and fading (their bubbles even if their lines are not selected, and their lines in the scene), the one that tried shakes for the first 0.45 s. The bubble goes back to showing the old number after Enter. The "in the way" list is the constraints that each, left out alone, let the rest be solved (not a minimal set).
**Notes kept:** `docs/roadmap.md` has a new section "Not done yet" with every open item from the handoffs and your requests, so none is lost; update it when one is done.

## Handoff 101 — 2026-11-05 (world planes: invisible and not selectable)
**State:** `in_121`. 161 tests pass, `npm run check` clean. Browser check at a shallow angle (elevation 0.04): the page is plain white, the ring sits on the plane under the pointer and stays after a click, nothing is selected.
**The haze, found:** it was not a sheet (there are none since the last change); it was the hover ring's shader on the huge hit surface: at a shallow angle the ring's line-width calculation blows up far from the pointer and paints a wide band. The ring on a world plane is now an ordinary thin circle (a polyline, one pixel-width line in the ring colour) at the point under the pointer, so nothing can smear.
**Not selectable:** a click on a world plane selects nothing (it lets go of the selection, as a click on empty space does), also with three clicks; the ring stays. A world plane is still a candidate for the hover ring, for a tool's first click (a figure draws on it) and for a double click to look straight at it; the X Y Z keys and buttons still choose the plane for drawing.

## Handoff 102 — 2026-11-05 (zoomable axes, white standard arrows, push / pull = extrude, mode bubbles)
**State:** `in_122`. 161 tests pass, `npm run check` clean, docs/layer/unused checks clean; the page loads with no errors in a real browser (I did not re-run the full click-through of every item below, please try them).
**Axes:** now a real size in the world (`settings.world.axisLengthMm` 8.4, the same size as before at the home view) so they zoom with the model. The X Y Z letters are hidden when the model is between them and the eye (a ray from the eye, `ui/world.ts`).
**Selected body:** the whole body is blue while selected, also while its move arrows are up (the filter in `frameOf` is gone).
**Arrows:** white with a thin dark rim (so they read on the white page); one size for all: a double arrow reaches 0.3 of the gizmo length each way, a single arrow is the same overall length, and the heads are the same everywhere. The push / pull / extrude arrow is now a double arrow through the face's middle (out pulls, in pushes).
**Push / pull = extrude:** they were already one signed distance (positive adds, negative cuts, an extrude of a figure into a body also cuts); the arrow, the typed number and the chip are now the same for both. I could not make the kernel leave slivers in my cases (box, L-shaped body, side and step faces, in and out, repeated pushes); the one real fault I found is a push that goes all the way through the body, which threw inside the kernel. It is now refused with "the push goes through the body" and the body stays as it was. If the slivers still appear, tell me the exact steps (which face, how far, what was done before) and I will turn them into a test.
**World planes stay:** the starter-pane exclusion after the first body is gone; the planes are still invisible and unselectable, they are the backdrop for the hover ring and for drawing.
**Lines of the body:** selecting one no longer shows the arrow by itself; a small bubble with a fillet / chamfer icon sits on the line (with its length bubble); clicking it enters the mode and the double arrow appears (`modesFor`, `Annotation.mode`).
**Not done:** the sliver bug is not reproduced (see above); the arrow size is my guess at "standard" (tune `HALF` in `interaction/gizmo.ts`, `gizmo.sizeOfView`, and the cone sizes in `ui/view/gizmo.ts`).

## Handoff 103 — 2026-11-05 (sketching: a click makes the figure, a ball sizes it)
**State:** `in_123`, `dec_sketch_place_then_drag` (provisional: please try it). 163 tests pass, `npm run check` and the doc, layer and unused checks clean. Browser: pressing R then clicking on the XY plane makes a 10 by 10 rectangle at the click, selected, with a ball on its far corner and the size chip; no page errors. I did not drag the ball in a real browser (the tests drag it).
**How it works:** a tool's first click on a surface makes the figure at once (rectangle 10 by 10, circle diameter 10, line 10 long along the plane's first direction; `settings.sketch.defaultMm`), selected, in the history. A ball (`sketch` handle) sits on its other defining point. Dragging it lifts the figure out of the scene (the preview stands in) and makes it again where you let go: the figure stays one history step. Typing a size while it is up makes it again at that size (Tab for the second field). A click anywhere else, Enter or Esc ends the drawing and the figure stays. The keys R C L and the menu start the same thing.
**The pencil:** a selected plane or face (body face, drawn figure, or a world plane chosen with the X Y Z buttons) shows a pencil bubble at its middle; clicking it replaces it with rectangle, circle and line bubbles; choosing one arms the tool on that plane. Esc closes the choice. (`modesFor`, `AppState.sketching`.)
**Removed:** the second click that finished a figure, and the line that chains corners and closes onto the first: a line is one segment now.
**Not done / for you to say:** chained lines and a closed polygon (a pencil shape for it?); a world plane cannot be selected by a click so the pencil there needs the X Y Z button first; the ball is only for the first figure, afterwards select the figure and use its constraints; default size 10.

## Handoff 104 — 2026-11-05 (push / pull fixed, value box, charcoal arrows, face bubble)
**State:** `in_124`. 166 tests pass, checks clean. Browser: a figure, E, the box at the bottom shows `Distance [ ] mm`, I clicked it, typed 12, Enter, and the body appeared; no page errors.
**Push / pull, the real causes (both reproduced as tests first):** (1) a push stored only the name of the face; names are positions in the body as it is NOW, so after a second push or a turn the first push's face no longer existed and that step failed ("the face is gone"): your first push vanished. The step now keeps the face as numbers (normal, offset, a point on it) from when it was made (`faceParams`). (2) after a turn by an angle that is not a right angle the kernel returned an invalid solid: the prism was built along a rounded normal, slightly slanted. It now uses the face's own exact normal. (3) earlier: a push all the way through the body is refused. Steps made before this change still use the old way. Deleting or changing an earlier step can still make a later push mean something else (`dec_stable_references`).
**Arrows:** charcoal again (no white, no rim). **X Y Z lines:** fully opaque charcoal (`settings.world.axisOpacity` 1).
**Face:** a flat body face shows a push / pull bubble (and the pencil); clicking it shows the double arrow. A drawn figure still shows its extrude arrow by itself (tell me if that should be a bubble too).
**Value box:** a real input box fixed at the bottom centre replaces the chip that followed the pointer: it shows the operation's number (or a figure's sizes) and the live value while an arrow is dragged; click it and type an exact number, Enter applies, Esc cancels (`ui/chip.ts`, intent `entry`). Typing on the keyboard without clicking it still works. It also works on a phone (a real input).
**Not done:** a push on a face made of several faces or a curved face; the value box for Dimension edits.

## Handoff 105 — 2026-11-05 (sketching back to clicking points, pencil on world planes, larger axes)
**State:** `in_125`. 166 tests pass, checks clean.
**Sketching is back to clicking the points:** the first click on a surface sets the plane and the first point, the next click finishes a rectangle or circle, a line takes corners and closes on the first (or double click ends it), typed sizes and Enter as before. The place-then-drag experiment (`dec_sketch_place_then_drag`) is retired: its entry is deleted and its code removed. What stayed: the pencil, and the plane chosen from it takes the first click.
**Pencil on a world plane:** a single click on a world plane still selects nothing, but a pencil bubble appears where the click landed (`AppState.spot`); clicking it offers rectangle, circle and line there; Esc or any other click clears it.
**Axes:** `settings.world.axisLengthMm` 12 (was 8.4); still a real size in the world, so they zoom with the model.

## Handoff 106 — 2026-11-05 (push / pull icon, sketch planes offer it)
**State:** `in_126`. 166 tests pass, checks clean (not tried in a browser).
**Icon:** a flat sheet (a parallelogram) with an arrow standing out of its middle, along its normal.
**Sketch planes:** a selected drawn closed figure now offers the push / pull bubble and the pencil, like a body face; nothing shows by itself any more except the body's move arrows. The bubble starts push / pull, which on a drawn figure is the extrude (same operation, same arrow, E still starts it too).

## Handoff 107 — 2026-11-05 (value bubble, new icon, no pencil on world planes, bigger axes)
**State:** `in_127`. 165 tests pass, checks clean. Browser: a rectangle, E: a small white bubble sits at the arrow tip.
**Value bubble:** the box at the bottom is gone. A small rounded bubble like a constraint's number (just the number, the words are the tooltip) sits by what it sets: at the tip of the push / pull or extrude arrow, at the first edge for fillet / chamfer, at the middle of the handles for move, rotate and scale, by the pointer's figure for a drawing tool (the two fields side by side). It shows the live value while you drag an arrow; click it and type an exact number, Enter applies, Esc cancels; typing on the keyboard still works without clicking. (`ui/chip.ts`, `Entry.at`, `entryWhere` in `frame.ts`.) A Dimension has no handles, so its bubble sits at the bottom middle.
**World planes:** the pencil on a click on a world plane is removed (`spot` and its test are gone). The pencil is offered for a selected plane or face, including a world plane chosen with the X Y Z buttons.
**Push / pull icon:** now a small block with an arrow pulling out of its top. **Axes:** `axisLengthMm` 18 (12 before).

## Handoff 108 — 2026-11-05 (arrow stays, round faces, glossier)
**State:** `in_128`. 167 tests pass, checks clean (not tried by hand in a browser: please try a post or hole).
**Arrow stays:** after a push / pull the operation moves to the face where it now is (`afterPushPull`): the arrow stands on the new face and the new face is selected, so you can go on pulling. (Before, the arrow went back to the old face's place.)
**Round faces:** a full round face of the body (a post or a hole, along a world axis) is now a part (a plane with a `curved` field, name `b/body/c@axis,cx,cy,cz,r,lo,hi`) that can be hovered and selected, and offers the push / pull bubble (no pencil, it is not flat). A circle is made of two halves in the kernel; they are gathered into one face. Push / pull on it changes its radius by the distance: pulling a post makes it thicker (diameter plus twice the distance), pulling a hole's wall makes the hole smaller; positive always adds material (`cylRadius` with `delta`). The step stores the face's numbers like a flat face's.
**Not done:** round faces that are not along a world axis (after turning by an angle), cones and spheres, fillet faces; a curved face cannot be sketched on.
**Gloss:** `settings.light`: roughness 0.4, sheen 0.55, sheen roughness 0.25, reflect 0.5 (were 0.5, 0.3, 0.45, 0.35). Yours to tune.

## Handoff 109 — 2026-11-05 (bubble off the arrows, X Y Z rotation, no pencil on world planes, bigger axes)
**State:** `in_129`. 168 tests pass, checks clean. Browser: a box, three clicks, T: the bubble shows `X 0  Y 0  Z 0` to the right of the body, the rings and arrows are not covered; no page errors.
**Bubble:** it now stands out past the tip of the arrow, away from the arrow's other end (to the right when there is no arrow direction), by half its size plus 18 px, so it does not sit on the arrow.
**Rotation:** the body's three angles are shown (X, Y, Z in the bubble) and each field sets that angle on its own. The angles are of the turn made so far (every rotate step, one after another) written as X first, then Y, then Z about the world axes (`math/rotation.ts`); dragging a ring shows the change live in the three. Typing in one field (or typing digits, which go to the axis in use) and Enter turns the body to exactly the angles in the fields: the difference from how it is turned now is done as up to three rotate steps (X, Y, Z) in one command, about the placed pivot. Fields you leave alone keep their value. Rotating a drawn figure is still the single angle bubble.
**Pencil:** a world plane never offers it (a selected world plane, by the X Y Z buttons or a double click, shows nothing; use R C L or the menu to draw on one). The pencil stays for body faces and drawn figures.
**Axes:** `axisLengthMm` 24.
**Not done:** angles are written in one fixed order (X, Y, Z) so for a body turned about more than one axis the three numbers are not the only way to say the same turn; a turn very near the Y axis standing on end (gimbal) shows Z as 0.

## Handoff 110 — 2026-11-05 (one step per operation, arrows stay, 0 not blank)
**State:** `in_130`. 169 tests pass, checks clean (not tried by hand in a browser).
**Cause of the vanishing chamfer arrow:** the arrow was found from the selected lines; once the fillet exists those lines are gone, so there was nothing to draw it on. The edge arrows' places are now kept when the operation starts (`Op.edges`).
**One step per operation:** for push / pull, extrude and fillet / chamfer the operation makes one step; each further drag or typed number takes that step out and makes it again with the total, so the value is the total since the operation began and does not reset between drags, the push / pull arrow stays on the face where it is (out by the total), and the preview while dragging is the real result with the earlier step replaced. A number typed in the bubble is the total too. A click in blank space or Esc ends the operation (the step stays); Ctrl+Z ends it as well as undoing the step. Rotate, move and scale still make a step per drag.
**0:** a bubble with no value yet says 0, not a blank.
**Removed:** `afterPushPull` (the arrow now follows the total instead of jumping to a re-found face).

## Handoff 111 — 2026-11-05 (the not-done list, as far as it could go)
**State:** `in_131`. 174 tests pass, checks clean. Browser: a rectangle from the menu shows the push / pull and pencil bubbles, the 24 mm axes, no page errors.
**Decisions taken from the human:** hover ring stays over a selected body; no letter keys for now (the keymap keeps only Ctrl+Z, Ctrl+Shift+Z or Y, Ctrl+S, Ctrl+O, Esc, Delete); constraints are bubbles only; the extrude bubble stays; the push / pull slivers cannot be reproduced for now.
**Handles:** `settings.gizmo`: length 0.11 of the view distance (was 0.17), opacity 0.6, line width 2.2, heads and balls at 0.7 of the old size; the one under the pointer or being dragged is solid.
**Scale for a drawn figure:** select it, Scale from the menu: a ball pulls out (or type the factor): corners move about the figure's middle, a circle gets its radius times the factor (new command `setRadius`); what fixes a size (fixed corners, lengths, diameters, angles) is let go.
**Corner drag:** pressing on a corner of a drawing and dragging moves the corner (not the camera); it is held where the pointer is while the solver settles the rest, so a rectangle stays a rectangle; the whole drag is one undo.
**Alignment:** while drawing, the pointer lines up (level or upright) with a corner within 6 px (`settings.sketch.alignPx`), with a thin guide line from that corner.
**Several faces:** select flat body faces (Shift) and the push / pull bubble moves them all by the same distance along their own normals (one command).
**Curved edges:** a curved edge of the body (a rim) is picked and highlighted along its arc (`arcPoints`), not along its chord.
**Code:** `interaction/actions.ts` (99 lines) builds actions; `interaction/rows.ts` (172) holds the relations table.
**Not done, and why:** more than one body, kernel in a worker, stable references, history panel, press-drag drawing and the rest of the curved faces: see `docs/roadmap.md`; each needs a decision or is large.

## Handoff 112 — 2026-11-05 (lists in the menu, more curved faces, the kernel on its own thread, a check of the last two prompts)
**State:** `in_132`. 177 tests pass, checks clean; everything below also tried in a real browser (scripts in the scratchpad).
**Lists:** the ⋯ menu has Bodies and History. Each opens a card at the top left (one at a time; choosing it again or its × closes it). Bodies: every body with its name (Body 1; there is only one, and names are not editable yet), click selects it. History: the building steps, oldest first (Extrude 20 mm, Push / pull 5 mm, Fillet 3 mm, Rotate Z 90°, ...) with × to take a step out, and undo and redo buttons. Sketches and constraints are not steps and are not listed. (`interaction/panels.ts`, `ui/panel.ts`, intents `panel`, `panelRow`.)
**More curved faces:** cones, spheres, fillets and turned posts are parts you can select and see (a plane part with `rounded`), named by surface type and where it lies; they offer no pencil and no push / pull (the message says why). Round posts and holes along an axis still change diameter.
**Kernel fix:** the kernel now runs in a web worker (`src/kernel-worker.ts`, `src/kernel-async.ts`). `evaluate` is the same call: it returns the result for a graph if it has it, else the last result, and asks the worker (only the newest request is kept, one at a time); when an answer comes the session is derived again (`refresh`) and the picture updates. So a heavy model no longer freezes the page: it appears a moment later; during a drag the picture follows as fast as the kernel can. After an undo or redo the scene is derived again too. If the worker cannot start the app runs the kernel in the page as before. `tools/check_layers.py` now counts every file directly in `app/src` as the composition root (main.ts and the two kernel thread files).
**Press-drag drawing:** dropped as you said. **Not as you described:** dragging a corner of a drawing with the pointer (added last time) is still there; say if you want it removed so that resizing is only through the operations and their arrows.
**Check of the last two prompts, by trying them in a browser:** (1) pull a box's top face 10 mm with the arrow: the volume went 16000 to 24000, the arrow stood at the new face (z 30), the bubble kept showing 10 after letting go; (2) a cylinder's side can be clicked, offers push / pull, and pulling the arrow 3 mm made the radius 10 to 13; (3) glossier: settings changed (roughness 0.4, sheen 0.55, sheen roughness 0.25, reflect 0.5), you judge the look; (4) the value bubble stands beside the arrow, not on it (screenshot); (5) rotate shows X Y Z fields, 0 0 0 at first; typing 90 in Z turned the 40 x 20 x 20 body to 20 x 40 x 20 and the fields then read 0 0 90; (6) a click, a double click and the X Y Z buttons on a world plane showed no pencil; (7) axes 24 mm (were 8.4 at first).

## Handoff 113 — 2026-11-05 (left click: constraints; right click: a ring of operation bubbles; ⋯: settings)
**State:** `in_133`. 177 tests pass, checks clean. Browser: a left click on a face shows no mode bubbles; a right click on it shows a ring of nine round bubbles around the pointer (Rectangle, Circle, Line, Push / pull, Fillet / chamfer, Move, Rotate, Scale, Delete; the ones that cannot start are dimmed, their tooltip says why); choosing Push / pull shows the arrow and the value bubble; the ⋯ button opens Bodies, History, Save, Open…, the scroll option and the build number.
**Left click:** constraints and dimensions only. Removed: the pencil and its shape choice, the extrude / push / pull bubble, the fillet / chamfer bubble (`modesFor`, `sketching`, the `sketch` intent, the plane given to a tool).
**Right click or long press:** the ring (`ui/ring.ts`): icons only, the words in the tooltip, laid round the click point (kept on screen), the same size and look as the constraint bubbles. An operation starts as before (arrow and value bubble for push / pull, fillet / chamfer, move, rotate, scale; a drawing tool waits for its first click on a surface). Extrude is Push / pull on a drawn figure. A right click on something selects it first (never a world plane). Constraints are no longer in the right-click menu: use the left click. Dimension is the measure bubble on the left click.
**⋯:** Settings and options: Bodies, History, Save, Open…, Scroll, Build.
**Not done / for you:** the ring has no keyboard way in; the order is tools, operations, Delete (say if you want another order or grouping); `dec_interaction_spec` still describes the older menu.

## Handoff 114 — 2026-11-05 (the shake: the kernel thread's stale answers)
**State:** `in_134`. 178 tests pass, checks clean.
**Tried it:** in a real browser I dragged the Move arrow and a Rotate ring on a box with all its edges filleted, sampling the body and the handle every frame. On the plain box it was smooth; on the filleted one the body jumped back to its starting place every few frames while the arrow kept going: that is the shake you saw.
**Cause (mine, from the kernel thread of Handoff 112):** while the worker is still busy, the kernel call answers with "the last result". Reading a result that was already known (the committed model, for example) also made it "the last result", so the next unanswered frame showed the body back where it started. **Fix:** "the last result" is only what the worker finished last, never one read from the cache (`kernel-async.ts`). After the fix the body follows the handle without jumping back; on a heavier model it trails the handle by about a frame, since the kernel answers a moment after the question (it never freezes the page now). A test with a stand-in worker (`test/kernel-async.test.ts`) covers the rule.
**Not fixed, to know:** on a much heavier model the body trails the arrow more (the arrow follows the pointer at once, the body when the kernel has answered). If that is too much I can draw only the arrow's outline until the answer comes, or fall back to running the kernel in the page for light models; tell me what you see.

## Handoff 115 — 2026-11-05 (priorities, arrows on click, sizes, lines of bodies, planes as objects)
**State:** `in_135`. 182 tests pass, checks clean. Browser (box demo): a click on the top face shows the arrow and a bubble saying 20; typing 30 in it made the block 30 thick (volume 24000); a click on a top edge shows the double arrow a quarter of the way along, clear of the 40 length bubble at its middle, and the 40 is editable.
**World planes:** an infinite world plane is only the background now: it is hit only when nothing else is under the pointer, even if it lies between the eye and a model (the old rule kept "the nearest surface" and the plane could be it).
**Sketch on a face:** a drawn figure and the face it lies on are one surface for double click (look straight at it) and triple click (select the object): clicks on several surfaces that are the same plane count as one.
**Arrows on click (`in_135` replaces `in_133` for these):** a selected drawn figure shows the extrude arrow, a face of the body (one or several) the push / pull arrow, lines of the body the fillet / chamfer arrows, the body its move arrows: all by themselves, with their value bubble. The first drag turns it into the operation, which stays up (one step, the value is the total) until you click away. The right-click ring remains for the others. The left click still shows no pencil or mode bubbles.
**Chamfer arrow offset:** a quarter of the way along the edge, so it is not under the length bubble.
**Sizes:** the bubble of a push / pull shows the size you are making (how thick the body is across that face, or the diameter of a round face) and a typed number is that size: typing 20 on the 40 mm end of a 40 x 20 x 20 block makes a 20 mm cube. An extrude shows its distance.
**Lengths of lines of a body:** the length bubble of a straight edge of a block (an edge between two faces across it) can be typed over like a sketch's; the face at its end is pushed or pulled by the difference (`interaction/lengths.ts`). Other edges stay measurements.
**Planes as objects:** a selected drawn figure's Move gives the X Y Z arrows, Rotate the X Y Z rings, a movable centre and the three angle fields (how its plane is turned now, each settable), like an object. New command `transformFigure` moves its corners and the plane they lie on; a figure on a world plane or on a face of the body gets a new plane of its own (so it can leave it); a plane with only this figure on it is moved itself. Fixed corners of the figure are let go. Scale of a figure is as before.
**Not done / know:** two figures on one plane move separately (the one you move gets its own plane); the old in-plane U / V arrows are gone (X Y Z instead).

## Handoff 116 — 2026-11-05 (the model that broke three things)
**State:** `in_136`. 185 tests pass, checks clean. Browser: the model loads (a debug `__cad.load(text)` was added), pushing its bore wider leaves a clean hole, a selected edge is hidden by the body.
**The model file** is kept as a test fixture (`app/test/fixtures/channel-block.cad.json`) and three tests use it.
**The spare cylinder sheet (push / pull of a round face):** the ring that is cut or fused used the radius of the reference rounded to four places, so its inner edge missed the old wall by a few hundred-thousandths of a millimetre and left a paper-thin tube of the old wall in the hole. It now uses the face's own exact radius, axis and ends, and reaches a hair (a thousandth) past the old wall on the side where the old wall is. Same family as the earlier slivers.
**The face that could not be selected, and clicking through the body:** two separate faces in one plane (here the block's end at x = 13.5, cut in two by the cross hole) got the same name, so one replaced the other and was gone from the scene: the larger face with the half round cut was not selectable and did not hide edges behind it. Faces that share a plane are now also named by where they are (`f@nx,ny,nz,d~x,y,z`), and every face of the body is a part (a test compares the triangle counts). A curved edge was also tested for hiding only at its middle point; it is now tested at the point nearest the pointer. A check over 1400 line picks from 20 views: 39 were picked while hidden, now 0.
**Selected lines and corners** are depth tested now, a little in front of the surface they lie on, so a body hides them (the helper arrows still show through, so they can always be grabbed).
**Know:** steps saved before this keep their old face names; a push stores its face as numbers so it still works. A push / pull of a hole that breaks through an edge (a partial cylinder) is still not offered.

## Handoff 117 — 2026-11-06 (orthographic, undo / redo, curve, line, repeats)
**State:** `in_137`. 190 tests pass, checks clean. Browser: the Linear repeat bubble shows six numbers and the body's copies appear at once; the ⋯ menu starts with Undo and Redo.
**Orthographic:** looking straight at a plane the push / pull and extrude arrow (and its bubble) are not shown; fillet / chamfer arrows and the move arrows stay.
**Undo / redo:** first two rows of the ⋯ menu, dimmed when there is nothing to do.
**Line:** two clicks make one segment and the tool is put away (typed length: the same). An open line is fine; it is not extrudable. A line that starts or ends on a corner that is already there shares that corner, so lines meeting in a loop make a shape (a face) by themselves. The chain-and-close behaviour is gone.
**Curve (arc):** new right-click bubble (`Curve`): click the two ends, then a third click for how far it bows out (the distance of the pointer from the chord; the bubble shows and takes that height). It is a line with a `bulge` (`Line.bulge`, the sag as a fraction of the chord), so its ends can move and it keeps its shape. It is picked, drawn and filled along the curve; an arc and its chord (or a loop with arcs) is a shape and extrudes with the curve (the outline is 24 points per arc). Not yet: constraints that know about arcs (its length is the chord's), a tangent or radius dimension, an arc by centre and radius.
**Repeats:** two new right-click bubbles, Linear repeat and Circular repeat, for the body. The copies are joined to the body (a new `pattern` step, one undo). Linear: copies along X, Y and Z (`nX dX nY dY nZ dZ`: how many and how far apart; 3 along X by default, a line, a grid or a block by setting the others). Circular: `n` copies over `°` degrees (360 = all the way round, shared out evenly) about the axis X / Y / Z (`axis` 0 / 1 / 2) through the point `x y z` (default: one and a half widths to the +X of the body's middle). The result shows as you type; Enter or a click in the picture applies, Esc cancels. At most 200 copies.
**Not done:** repeating a drawn figure (only the body is repeated), picking the circular axis and point with handles (numbers only), copies that overlap are just joined, a repeat of a face or of a hole's cut (it repeats the whole body as it is at that step).

## Handoff 118 — 2026-11-06 (Ø and R, the lag, the extrude that did nothing)
**State:** `in_138`. 194 tests pass, checks clean. Browser: the model opens with its two new pieces (volume 3297, was 2050).
**Diameter or radius?** The drawing standard: **Ø (diameter)** for a full circle, a round hole or a post (that is what is dimensioned, and what you measure with a caliper); **R (radius)** for a part of a circle, an arc or a fillet. So: a circle's diameter bubble shows Ø; a full round post or hole, when clicked, shows its push / pull bubble as Ø and typing sets the diameter; a fillet or other partly round face of a cylinder or sphere shows R and its radius (read only) on the face. The mark is in front of the number (`Annotation.symbol`, `short` in the value bubble).
**Why nothing was extruded:** a figure pulled the negative way while a body exists was always a cut; drawn in the open (a world plane, away from the body) it cut nothing, so nothing appeared. It is now "cut or add": if the pulled-back figure meets the body and removes material it is a pocket (a figure drawn on a face and pushed in is as before), otherwise it is a new piece (`mode: cutOrAdd` in the kernel). Both pieces of your model now appear. All the pieces are still one 'Body 1' in the list (a body here is the whole result): separate bodies you can select one by one are not built.
**The lag:** the kernel worked out the whole model again for every frame of the drag (about 250 ms for your model). It now keeps what it worked out before, by what each step was built from, so a move at the end redoes only the move: about 90 ms (opening your model went from 4.0 s to 1.3 s). What is left is mostly making the picture (faces, edges, mesh) of the result; if it is still not smooth enough, the next step is a coarser mesh while dragging.
**Not done:** several bodies as separate selectable things; a coarser mesh while dragging.

## Handoff 119 — 2026-11-06 (the lost first click, repeat handles, repeating sketches)
**State:** `in_139`. 198 tests pass, checks clean. Browser: the Linear repeat shows an arrow and a short arrow per axis with the six numbers; the copies show as you go.
**The lost first click:** a press that wandered more than 4 px before release was a turn of the view, and on a trackpad that is common. While a drawing tool is armed the limit is now 14 px (22 px for a finger): `settings.view.drawClickMovePx`, `settings.input.drawTouchSlopPx`; a real drag still turns the view. (`recognizer.setDrawing`, set from the state after every intent.)
**Circular repeat handles:** the rotation rings (X, Y, Z) and the ball. Take a ring: that is the axis, and turning it sets how many degrees to spread the copies over (starts at 360); the ball is dragged to the point they turn about (it sticks to a corner you point at). The numbers are in the bubble too.
**Linear repeat handles:** per axis an arrow from the middle of the thing to where the next copy goes (pull it: the distance between copies; a negative distance goes the other way), and a short arrow past the last copy (pull it out: more copies, pull in: fewer; one copy per spacing). Nothing is made while dragging; the copies show, Enter or a click in the picture applies, Esc cancels.
**Repeating sketches:** select a drawn figure (a face of lines, or a circle) and the same two bubbles repeat it: copies of its corners, lines (arcs too), circles and the relations among them, so a rectangle stays a rectangle; copies lying in the same plane share it, a copy that leaves the plane (or is turned out of it) gets a plane of its own. One undo takes all the copies away. (`interaction/pattern.ts`; the body repeat is a kernel step as before.)
**Not done:** repeating only part of a figure (select the whole figure); repeats of a body's single faces; the repeat of a body that is repeated again is a second step (fine) but cannot be edited afterwards.

## Handoff 120 — 2026-11-06 (right click keeps the selection, copy, arcs with centres, on-line and tangent)
**State:** `in_140`. 204 tests pass, checks clean. Browser: a curve drawn with the Curve bubble stays selected (teal) when the right-click ring opens; the ring shows the operations dimmed where they do not apply.
**Axes:** arrowheads of the X Y Z axes are about a third of their size (`HEAD` in `ui/world.ts`).
**Right click:** it opens the ring on what is selected and changes nothing about the selection (no select, no deselect). Select first (a click, a triple click, Shift for several), then right click. Several figures selected together are moved, turned, copied or repeated together (same plane for repeats).
**Copy:** a ring bubble. It is a repeat of two (the thing and one more beside it): the same arrows and numbers, so you place the copy with the spacing arrow or by typing. Works on the body, a closed figure, an open line, an arc, a circle.
**Arcs black:** an arc is drawn with the same thin black line as the others (it was not drawn at all when not selected).
**Arcs about a centre point:** a Curve (still three clicks: the two ends, then how far it bows) now makes the arc about a centre point of its own (a corner, shown when you point at it or select it) with a relation that keeps both ends the same distance from it (`arcEnds`, hidden). So: the centre can be fixed, made coincident with another corner, put on a line, etc.; the arc has a **radius** dimension (select the arc: `R` bubble; typing sets it, the distance from the centre to the start); delete takes the centre with it; moving or copying a figure takes its arcs' centres along. Older arcs drawn by the first version of the tool (a bulge, no centre) still work but have no centre.
**On line (a vertex on a line):** select a corner and a line (either order): `On line`. The corner then slides on the line, which goes on past its ends: wherever it is moved to it comes back onto the line.
**Tangent:** select a line and a circle, or a straight line and an arc: `Tangent` (the line's distance from the centre equals the radius). A circle or arc keeps its size and place softly while the line moves to touch it.
**Not done:** tangent between two arcs or circles; an arc by clicking the centre and then the radius (the centre is made for you); a tangent that also joins the line to the arc's end (do both: coincident then tangent); the arc has no length-along-the-curve dimension (its length is the chord's).

## Handoff 121 — 2026-11-06 (repeat edit mode: Apply / Cancel, bubbles per axis, the pivot as a vertex)
**State:** `in_141`. 201 tests pass, checks clean. Browser: a linear repeat shows ✓ and ✕ at the top, a count / distance bubble on each axis; a circular one shows the rings at the pivot, a line from the body's middle to it, and one bubble (count, degrees) to the side.
**Repeat edit mode (`AppState.repeat`):** Linear repeat, Circular repeat and Copy open a repeat that is its own state, not an operation. It ends only with ✓ Apply or ✕ Cancel (top of the screen); a click on nothing, Esc, Enter in a bubble, or dragging a handle do not end it. The result shows as you go. Meanwhile you can select, draw (rectangle, circle, line, curve), Move and Rotate (right-click ring) and use constraints. Not offered meanwhile (dimmed with the reason): push / pull, fillet / chamfer, scale, copy and the repeats again, delete; undo and redo are ignored (they could take the pivot's parts away).
**Linear:** three bubbles, one at the end of each axis's spacing arrow: `X×` how many, `Δ` how far apart (same for Y and Z). The count arrows (short ones past the last copy) now start 0.9 of a handle length beyond the last copy while there is only one (clear of the spacing arrows), and 0.35 once there are copies.
**Circular:** the three rings only; **a click on a ring makes it the axis** (dragging it also sets the degrees); one bubble `n` (copies) and `°` (degrees), to the right of the rings so it does not cover them.
**The pivot:** when a circular repeat opens, two vertices and a line are added to the scene: one at the middle of what is repeated (held fixed) and the pivot point, with the line between them. They are ordinary drawn parts: select the line to size it (its length bubble), select the pivot to constrain it (coincident, on a line, ...), or Move it with the ring. The repeat follows wherever the pivot is. For a drawn figure they lie on its plane; for a body on a plane of their own through the pivot. Apply or Cancel takes them away (the copies, if applied, are made first, in one undo step; the adding of the parts when it opened is a step of its own in the history).
**Not done / know:** the rotation axis passes through the pivot parallel to X, Y or Z (not along a drawn line); the middle vertex stays where the object's middle was when the repeat opened (if you move the object meanwhile it does not follow); a repeat is not saved in a file while it is open.

## Handoff 122 — 2026-11-06 (the hole that broke: steps made on an older picture, and steps that could not be made)
**State:** `in_142`. 204 tests pass, checks clean. Your file is a test fixture; opened, it shows the three broken steps in red.
**What happened in your file:** the last four push / pulls of the hole (s_024 to s_027) all name the hole as it was before the first of them (radius 2.2405), and s_025 asks to take 2.7 mm off a hole that is 2.24 mm in radius: that cannot be made ("the radius must be positive"), so s_025 failed and s_026 and s_027, built on it, failed with it: the model stopped at s_024 and the picture was stale and odd. Two faults of mine made that possible: (1) with the kernel on its own thread, the picture can show the model from before your last change for a moment, and a step started then names the old hole (it was made from an older picture); (2) a step that the kernel could not make was kept in the history anyway.
**Fixes:** (1) while the kernel's answer for the last change is still to come, a new step is refused ("the model is still being worked out: try again in a moment"); what is shown meanwhile is marked as old (`KernelResult.stale`). (2) A step that cannot be made is refused at once, with the reason, and nothing is added (`session.run`); if the answer comes later (kernel on its thread) and it is an error, the step is taken back and the reason shown (`refresh`, `checkSteps`). (3) A push / pull of a round face whose size is not what the step remembers (an earlier step changed it) now finds the same hole by its axis, place and nearest size instead of failing. (4) The history list shows a step that could not be made in red with ✕ and the reason on hover; × takes it out. (5) A job the worker fails on gives an answer (an error), so nothing waits for it for ever.
**Repairing your file:** open it, History (⋯), the last three steps are red: take out the three (s_027, s_026, s_025 with ×), or just the first and the others go with it as they need it. Opening a file with broken steps does not change it.
**Know:** steps already in a file are not changed; the typed size of a hole is stored as a distance from the size it had, not as the size you typed (so a step is only right for the hole as it was).

## Handoff 123 — 2026-11-06 (click grammar, lit axis button and eye, centre vertex, layered ring menu)
**State:** `in_143`. 205 tests pass, checks clean. Browser: right click opens Sketch / Constraints / Shape / Move and repeat / Delete; Sketch unfolds into its four tools with a red ✕ in the slot that was clicked; ✕ folds back.
**Clicks:** 1 select; **2 select the whole object**; **3 look straight at the plane** (from the side you are on; no waiting for a third click any more, `pendingLook` is gone). The selection stays as it was when the view turns.
**X Y Z and eye:** while one plane or face is selected (also a sketch's plane) the eye button shows at the top (left of centre) and looks straight at it; if the plane lies across a world axis, that axis's button at the lower right turns teal (`Frame.lookHint`, `Frame.eye`).
**Centre vertex:** a selected arc or circle also draws its centre vertex (like a hovered vertex), so you can click it and constrain the curve to other things. Know: it is drawn only while the curve is selected.
**Constraints, how to get at them:** right click → Constraints lists every constraint and dimension that fits the selection (select a line and a corner, two lines, …); the left-click bubbles still show those already there. Choosing a dimension adds it at the current measure, then click its number to type.
**Two-line distance cannot be deleted:** I could not make the command fail (it removes with two lines selected). Likely cause: with two lines there are two bubbles (the distance and the measurement) side by side, and the distance bubble grows its ✕ under the neighbour, which took the click. The hovered bubble is now raised above its neighbours. If it still happens, send the file.
**Menu tree:** `MenuItem.children`; `ui/ring.ts` keeps the path, all rings the same size and centre, unfolding animation from the clicked bubble, ✕ in its slot. Constraint leaves are ids of the relation actions (`doRunAction`). Allowed during a repeat: sketching tools, Move, Rotate and constraints.
**Icons:** new push / pull (a sheet with an arrow through it), eye, sketch, constraint, body.
**Not done:** the menu does not remember the open category between right clicks; Constraints lists only the ones that apply (no dimmed ones with reasons); the ring animation is not checked on a phone.

## Handoff 124 — 2026-11-06 (stuck after dragging an arrow with the right button)
**State:** `in_144`. 206 tests pass, checks clean. Your file is a fixture (`right-drag.cad.json`).
**What I found:** a right-button drag of the push / pull arrow works in a real browser (the face is pulled, the arrow stays, the next click works), so I could not make it stick. What your description fits (every later pointer move acting as a drag, nothing clickable, a fresh right click clearing it) is a button release the page never saw, so the drag it began carried on. Fixes: a mouse move with no button down ends the drag (`platform/dom-input.ts`); a window losing focus cancels any press; a new press while a drag is still open ends it first (`input/mouse.ts`, with a test). 
**Know:** this is the likely cause, not a confirmed one. If it happens again, tell me what the screen showed just before (a menu or the browser's own menu open? a trackpad two-finger press?).

## Handoff 125 — 2026-11-06 (eye under the axis buttons, signed axis highlight)
**State:** `in_145`. 206 tests pass, checks clean. Browser: selecting a top face lights `+Z` and fades the eye in under it; looking straight at the face fades the eye out.
**Eye:** now the fourth round button under Z (lower right). It fades out (0.25 s) while nothing flat is selected or the camera is already straight at the selection, and fades in when you can be.
**Lit button:** shows `+X` / `−X` etc.: the end of the axis the camera must be at to see the selected face (the side it is on now). Pressing X Y Z or the eye from an oblique view now goes to that same side (before, from an oblique view it went to the front, which could show the face from behind); pressed again it goes to the back.
**Know:** X Y Z still select the world plane of that axis, not the face; the lit state therefore goes with the selection you had before the press.

## Handoff 126 — 2026-11-06 (right button only turns the view, sketches go with their body, sketching modes that stay on)
**State:** `in_146`. 208 tests pass, checks clean. Browser: Sketch → Line, then four clicks make two separate lines with the mode still on; right click in the mode shows the four tools and a red ✕ ("Leave sketching").
**Right button:** a right press never selects, and a right-drag now only turns the view (the orbit intent carries `view: true`; it no longer drags a handle or a corner). Shift + right-drag still pans; a right click still opens the ring.
**Sketches belong to their body:** deleting the body hides the sketches it was extruded from too (they used to show again). They are still in the scene and the file (hidden, like while the body exists) and come back with Undo. `ownership.consumed` no longer clears on a delete step. Know: they cannot be picked any more after the delete; a sketch drawn later is not affected.
**Modes that stay on:** a drawing tool (rectangle, circle, line, curve) is now a mode: finishing a figure re-arms the same tool, so a line is click, click (made), click (next starts) … Escape drops the figure being drawn, Escape again leaves the mode; so does ✕ in the ring (`exit`). The ring while in the mode shows the tools of that level (switching tool keeps the mode) and the ✕. The mode's icon follows the pointer (lower right of it; `Frame.mode`, `controls.mode`).
**Not done:** only the sketching tools are modes so far; Move, Rotate, Scale, Push / pull and the others are still one-shot (a mode for them needs a decision on what ends one: say if you want it); a mode does not stop the pencil-bubble toggle by key (`begin` again still puts the tool away).

## Handoff 127 — 2026-11-06 (sketching modes taken back out)
**State:** `in_147`. 207 tests pass, checks clean. The sketching tools are one-shot again: finishing a figure puts the tool away, Escape ends it, a line is one segment. Also removed with it: the mode icon at the pointer, the ring that shows the tools and a ✕ while in a mode, the `exit` action. Kept from Handoff 126: the right button only turns the view, and deleting a body takes its sketches with it.

## Handoff 128 — 2026-11-06 (the right-click options in the ⋯ menu)
**State:** `in_148`. 207 tests pass, checks clean. Browser: ⋯ lists Rectangle, Circle, Line, Curve; the constraints that fit the selection (or a dimmed "Constraints" with the reason); Push / pull, Fillet / chamfer, Scale; Move, Rotate, Copy, Linear repeat, Circular repeat; Delete; then Undo, Redo, Bodies, History, Save, Open, Scroll, Build. The same items and the same dimming as the ring (it is the same list, flattened into groups: `rowsOf` in `main.ts`), worked out for the current selection when the button is pressed. The list scrolls if the window is short.

## Handoff 129 — 2026-11-06 (triple click selects only the face; a sketch tool turns the view to the face)
**State:** `in_149`. 208 tests pass, checks clean.
**Triple click:** selects only the face clicked (the double click had taken the whole object) and turns the view straight to it from the side you are on.
**Sketching:** choosing Rectangle, Circle, Line or Curve (ring, ⋯ list, or the keys) while a face or plane is selected turns the view straight to it (orthographic) and arms the tool; with nothing flat selected the view stays. The selection stays the face. Know: a tool pressed again to put it away does not turn the view back.

## Handoff 130 — 2026-11-06 (sketching goes on while you click on vertices)
**State:** `in_150`. 209 tests pass, checks clean (not tried in a browser).
**How it works:** for the sketching tools only. A figure finished by a click that lands on an existing drawn corner leaves the tool on: a line's next segment starts from that corner (so click, click on a corner, click on a corner … is a chain); a rectangle, circle or curve is ready for its next first click. A figure finished anywhere else (empty space, a typed number with Enter) puts the tool away as before. Escape ends it.
**I read it as:** the *finishing* click being on a vertex is what keeps the mode. If you meant the first click as well (starting on a vertex also keeps it), say so. Not done: nothing shows that the mode is on (no pointer icon, as that was taken out with the earlier mode).

## Handoff 131 — 2026-11-06 (resume sketching from the vertex just made, bubbles off the line, zoom through surfaces)
**State:** `in_151`. 211 tests pass, checks clean (not tried in a browser).
**Sketching goes on:** it failed because ending a line in empty space put the tool away *before* you clicked the vertex it just made. Now the tool is put away as before, but the app remembers the kind (`AppState.resume`): the next click, if it is on a drawn vertex, starts the next figure from that vertex (the tool is on again); any other click, or anything but a click or moving the view, drops it. A line finished on an existing vertex still goes on by itself.
**Bubbles:** every constraint / dimension bubble is drawn 14 px right and 24 px above the spot it belongs to (`OFF_X`, `OFF_Y` in `ui/bubbles.ts`), so it is not on top of the line. Know: for a line going up to the right the bubble can still be near it.
**Zoom through surfaces:** zooming in toward a surface under the cursor now stops when that surface is 1.5 mm from the camera (`settings.view.minSurfaceMm`). The cause: the view's centre sits behind the surface and its distance had a minimum of 3 mm, so near the end the camera had to pass the surface to keep zooming.
**Hints while drawing:** I wrote my proposal as `q_snap_suggestions` (open): horizontal / vertical, coincident / on line, perpendicular / parallel, tangent, equal length, same height / across. Nothing built; tell me which you want.

## Handoff 132 — 2026-11-06 (constraint hints while drawing a line)
**State:** `in_152`. 212 tests pass, checks clean. Browser (real mouse): drawing a line from a point to one that is a little off level, the end jumps level and a small horizontal icon shows beside it; the click makes the line with a horizontal constraint.
**What is offered** (`interaction/hints.ts`, `q_snap_suggestions`, still open as a question (the idea is approved, the exact list and thresholds are not)): while the second point of a **line** is chosen, if it is within 4° (`settings.sketch.hintDeg`) of **level** or **upright**, **parallel** to another line (not one starting at the same corner), **square** to another line, **tangent** to a circle (from the line's start), or within 2 % of the **length** of another line, the end takes it exactly; within the snap distance of another line (not at its ends) it is put **on** that line. Several can hold at once (level and square). The icons show beside the end; the other line or circle shows amber. A click makes the line and adds the constraints (one `addRelation` each, with the line and the end corner). At an existing corner no hint is offered (that is its own constraint). Holding nothing turns them off: no modifier yet.
**Also fixed on the way:** (1) the number bubble beside a line being drawn swallowed the pointer moves and clicks when the pointer ran over it, so the line seemed not to finish: it is now see-through to the pointer while a tool is on. (2) Choosing a sketch tool does not turn the view when it is already straight at the face.
**Not done:** hints for the rectangle, circle and curve tools; tangent to an arc; an off switch (a modifier key); hints while moving a corner (only while drawing); equal length is only to lines, not to a typed value.

## Handoff 133 — 2026-11-06 (corner on a circle, closer zoom, bubbles that dodge, fine grain)
**State:** `in_153`. 213 tests pass, checks clean. Browser: the body's faces show a fine grain that catches the light and the room's reflection; zooming in with the wheel gets much closer.
**On circle:** select a corner and a circle (either order): `On circle` (new icon). The corner slides round the circle and stays at its radius (the circle's size is held as it is). Also for a corner and an **arc**: `On circle` is offered instead of `On line` (an arc's "line" was the chord, which was wrong for it). Solver: `ptOnCircle`.
**Zoom:** the nearest the view can be is 0.3 mm (`settings.view.minDistance`, was 3) and, zooming toward a surface, 0.3 mm from it (`minSurfaceMm`).
**Bubbles:** each bubble (or cluster) is put at the spot, round its own, that touches the fewest drawn lines, corners and other bubbles: up and right first, then the other sides, then further out (`ui/bubbles.ts`, using `Frame.avoid`). It does not know the body's edges (only what is drawn), and it moves as lines move. If it is still in the way, say where.
**Grain:** a small tiling bump texture made in code (`ui/view/grain.ts`) on the body and on the see-through sheets (they are now lit: the same grey, slightly reflective). Strength `settings.light.grain` (0.14), tile size `grainTileMm` (3). Face coordinates are made from the face's normal, so it follows each face without stretching. Tell me if it should be more or less.

## Handoff 134 — 2026-11-06 (a line's end on a circle, selecting the circle edge, coincident with a circle)
**State:** `in_154`. 214 tests pass, checks clean.
**The end of a line on a circle:** drawing a line, when its end is within the snap distance of a circle's edge (a line from the centre to the edge, say) the end now goes exactly onto the circle and the line is made with a `Coincident with circle` constraint (the hint icon shows; `hints.ts`). Before, the edge only lit up under the pointer, the end was not put on it.
**Why the circle edge could not be selected (two causes):** (1) a corner, the circle and the line at one spot are on the same plane, so the quick second and third click counted as "select the object" and "look at the plane": the click grammar (since `in_143`) treated them as one surface. Now when a point, line or circle edge is under the click, repeated clicks **cycle** through them ("2 of 4 here", as before `in_143`) and the double and triple click only mean object / look when what is under the click is a face or plane. (2) the "keep sketching while you click on vertices" rule (`in_151`): the click on the new vertex right after drawing starts another line from it instead of selecting it, and the next click on the edge ends that line there. Press Escape (or click empty space) after drawing to select instead. I left that rule as asked; say if it should go.
**Coincident with a circle:** select a corner and a circle edge: `Coincident with circle` (it was `On circle`; added last time, but it is only offered for the circle itself, not for the disk face, which is what a click inside selects). Also for an arc.

## Handoff 135 — 2026-11-06 (grain taken out; sketch sheets shine like the body)
**State:** `in_155`. 214 tests pass, checks clean.
**Grain:** removed completely (`ui/view/grain.ts`, the bump map, the settings).
**Sheets vs body:** it was true: a sketch's grey pane was a flat see-through fill with no lighting at all (so no shine and no reflection), while the body had a clear-coat and the reflected room. Since the grain change (`in_153`) panes were lit but with their own values. Now the pane uses the body's own values (`settings.light.roughness`, `sheen`, `sheenRoughness`, `reflect`) and stays see-through (25 %), so its shine is the body's shine, faded by that. Not checked by eye beyond the page loading without errors; if it looks too faint or too bright, say which.

## Handoff 136 — 2026-11-06 (typed length keeps sketching going)
**State:** `in_156`. 215 tests pass, checks clean.
**Cause:** the "keep sketching while you click on vertices" memory (`AppState.resume`) was dropped by any intent that was not a click or a view move, and typing the length and pressing Enter is such an intent (`typed`). Now typing (`typed`, `entry`) keeps it: after Enter, the next click on the vertex starts the next line. Anything else (a menu, undo, Escape, a click elsewhere) still drops it.

## Handoff 137 — 2026-11-06 (dark sources in the reflection, world plane tint, teal a little more see-through)
**State:** `in_157`. 215 tests pass, checks clean. Browser: the page loads without errors; the faint plane tint shows on hover.
**Dark source:** the room reflected in the body and panes (`ui/view/studio.ts`) now has three black panels standing round it (left, right, back) beside the existing bright studio lights, so a face reflects dark as well as light, and the mix moves as the view turns. Only the reflection changes (not the scene lighting). Subtle on a light grey body: if you want more contrast, `settings.light.reflect` (reflection strength) up, or the panels bigger; say which.
**World plane tint:** a world plane that is pointed at or selected (the X Y Z buttons select one) gets a very faint teal square about the origin (`settings.orb.worldPlaneOpacity` 0.07, half-size 0.32 of the view distance) besides the ring.
**Teal:** the selection fill 0.3 → 0.25 and the hover ring 1 → 0.88 (`settings.orb.selectOpacity`, `ringOpacity`). Selected lines and corners are unchanged.

## Handoff 138 — 2026-11-06 (bug hunt: a freeze in the solver, cycling selection, bubble cost)
**State:** `in_158`. 217 tests pass, checks clean.
**How I hunted:** two random-action fuzzers (kept out of the repo, in the session scratch): one drives the controller with random clicks, hovers, tools, typing, undo, ring actions and times each step and each frame (thousands of steps, many seeds); one does the same in the real page through `window.__cad`. Nothing threw. They found a freeze and a slowness:
**1. The freeze (most likely yours):** adding a constraint (here Horizontal on one line) to a drawing of ~120 parts took **15 seconds** on the page's thread. The constraint solver is dense (cost grows with the cube of the numbers in the system) and, when a constraint conflicts, it tries leaving out each of up to 80 constraints in turn, each a full solve. Fixes (`compiler/solver/solver.mjs`): (a) constraints that share no corner or number are solved as separate groups (a drawing of many separate shapes costs the sum, not the cube); (b) the "which constraint breaks the others" search stops after 0.4 s and names what it found. The same runs went from 15 s / 2.8 s / 1.9 s to under 1 s. Tests added. Know: one big connected sketch with a conflict can still take about a second; the solver should eventually move off the page's thread or go sparse.
**2. Circle edge hard to pick (second cause found):** at a spot where a corner, a line and the circle overlap, repeated clicks are meant to cycle through them ("2 of 4 here"), but the spot was recognised by the candidates *in order of distance*, and a pixel of movement changes that order, so the cycle restarted at the first (the corner) every time and the circle was never reached. Now the same set of candidates is the same spot whatever the order, and the cycle keeps the order of the first click (`interaction/selection.ts`, test added). With the earlier fixes (double / triple click no longer swallow overlapping edges) a single click within 6 px of a circle's ring always selects it (checked at every 5° round it, seen from above and from the home view). Still there by design: the click right after drawing a line on its vertex starts a new line (`in_151`); Escape first.
**3. Page cost:** the bubbles' dodging was done by sampling along every line for every candidate spot; now it clips each line against the candidate's box and skips lines nowhere near, and the list of what to avoid is not even built when no bubble is shown.
**Seen, not fixed:** in the headless browser a page with ~70 drawn parts takes 0.3 s a frame, nearly all of it in the browser's own drawing (software rendering here); I could not tell how much of that a real graphics card would show. If it freezes again, tell me roughly how much was drawn and what you did last.

## Handoff 139 — 2026-11-06 (axis star, world plane pulse and double click, centre dots, the freeze again)
**State:** `in_159`. 218 tests pass, checks clean. Browser: the axes are a star (each goes as far the other way, an arrow at each end, labels on the positive ends); pointing at empty space lights a round faint disc as big as the axes that fades in 1.5 s; a double click there selects that world plane (the lit +Z button) and turns the view straight to it.
**World axes:** X Y Z each run from minus to plus the same length (24 mm) with an arrow each way (`ui/world/parts.ts`); an axis seen end-on loses both arrows.
**World plane highlight:** no longer a lasting square: a **disc** of the axes' size (`settings.world.axisLengthMm`, in mm, so it grows and shrinks with the axes as you zoom), opacity 0.07 fading over `worldPulseMs` 1500. It starts when the pointer first goes onto a world plane, on a click on one, and when X Y Z look at one (`AppState.worldPulse`; `Frame.highlight.world`). The hover ring stays while you point.
**Double click on a world plane:** selects it and turns straight to it from the side you are on (before, nothing happened). Triple click still looks at a face.
**Pencil on a world plane:** choosing a sketch tool from a right-click ring that was opened over a world plane turns the view to that plane (`menu.plane`); with a plane selected it already did.
**Centre dots:** the middle of every drawn circle and arc is always drawn, a small charcoal dot (it can be picked and constrained as before).
**The freeze:** I could not repeat your drawing exactly (not with the old or the new solver, and not in the real page), but I think I know it: the dodging of the constraint bubbles sampled along every line every few pixels, per candidate spot. Rotating into 3D when zoomed in very close, the circle's far parts project to enormous pixel lengths (points behind the camera), so it looped millions of times per frame. The version you ran has that; the bug-hunt version does not (it clips each line against a box instead, bounded work). If it still freezes on the newest version, tell me.

## Handoff 140 — 2026-11-06 (a cursor for a finger while sketching; the eye among the left-click bubbles)
**State:** `in_160`. 219 tests pass, checks clean. Real browser with touch emulation: tap the first point; tap a second spot: the line follows a cursor there with its guides and hint icons (a horizontal hint shows, the end snaps level), a round drag handle sits down and to the right of it; tapping the handle makes the line with its constraint.
**How it works (touch only):** with a sketch tool armed, the first tap is a click as for a mouse (it sets the plane and the first point). After that a finger has a cursor: (1) drag the handle: the cursor follows the finger (hover intents: the preview, the alignment guides and the constraint hints work as with a mouse); (2) tap the handle: the point is set where the cursor is (a click there); (3) tap anywhere else: the cursor jumps there (hover, not a click); (4) a one-finger drag elsewhere still turns the view; two fingers pan and zoom; a long press is the menu. The handle stays on screen (kept 30 px from the edges) and is drawn 66 px below and right of the cursor so the finger does not cover the line's end.
**Which device:** decided by the event itself (`RawInput.device`), not the machine: `lastDevice` in `main.ts` is whichever kind of input came last, so a laptop with a mouse and a touch screen shows the handle only after a touch and hides it when the mouse is used again. A pen is treated as a mouse (it hovers).
**Eye:** it is now a bubble among the ones of the left click (beside where the face was clicked, same look as the others), not by the X Y Z buttons. It fades in when the selected plane or face can be looked at and fades out once the view is straight at it; clicking it looks straight at the face (again: the back). Not shown while a tool or operation is running (like the other bubbles).
**Not done:** the touch cursor is only for sketching tools, not for Move or the push / pull arrows (those already have handles you drag); the hint icons can sit under the handle if the cursor is near a screen edge; not tried on a real phone.

## Handoff 141 — 2026-11-06 (axes back, world planes only on the positive side, zoom)
**State:** `in_161`. 220 tests pass, checks clean.
**Axes:** back to three lines, positive X Y Z only, one arrow each. The disc that lit up and faded on hover, click and look is gone (`worldPulse` removed), and so is the lasting tint. The hover ring stays.
**World planes only on the positive side:** a world plane is hit (hover ring, click, select) only where all three coordinates of the point are 0 or more: the three faces that face you when the page opens (XY: x, y ≥ 0; XZ: x, z ≥ 0; YZ: y, z ≥ 0). From the home view the other half of each plane is not there to point at (the ray may land on another plane's positive face instead). **Exception:** looking straight at a plane (orthographic) the whole of it is hit, since that is the plane you are working on (`PointerView.straight`). Not changed: a sketch tool with a plane selected (X Y Z buttons) draws anywhere on it; with nothing selected, a first click in the negative part in a 3D view now says "click on a surface to draw on". Kept from `in_159`: a double click on a world plane selects it and turns to it; the pencil from a ring over a world plane turns to it.
**Zoom (3D close up):** real wheel runs in the browser showed a single 3D notch zooming only about 17 %, not 26 %: the limit on how fast one gesture may zoom (5× a second) throttled slow notches (a notch every 0.3 s may only zoom a fifth). It is 30× now (`maxZoomFactorPerSecond`): a notch is ~25 % and from 120 mm to about 5 mm takes 11 notches, not 16+ (checked with real wheel events). Also zooming toward a point of the model (not the infinite world planes) now works when that point is up to 8 view-distances from the view centre (it was 1.5), so a small part far from the middle is zoomed into instead of the view going straight at the middle. The nearest the camera can get to a surface under the cursor is still 0.3 mm. If it still feels slow close up, say where the pointer was (on a face, an edge, empty space).
