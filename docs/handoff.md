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
