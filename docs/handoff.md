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
