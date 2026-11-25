---
id: q_lean_ui
kind: question
status: open
origin: ai-unreviewed
human_input: in_1562
date: 2026-11-23
depends_on:
  - inv_no_logic_in_ui: the screen only draws descriptions that the interaction layer makes
---
# What is the leanest interface for the rebuild, learning from the prototype?

**Recommendation (not decided).** The screen is made of a handful of parts, each described by data and drawn by one component, and the engine's answers (statuses, refusals, trims, asks) are the only source of what they show.

**Three looks of a body (the prototype's `ui/looks.ts` has four; the human wants two or three):** *Solid* (the default grey, lit), *See-through* (the dark nearly clear look: wireframe bodies, bodies behind a plane, the stand-in of a preview) and *Marked* (a colour laid over either: teal for picked or pointed at, red for a clash or a refusal, amber for a tie). A cut section is Solid clipped by a plane (not a look of its own; the hatch is a drawing on the cut). Every place that shows a body asks for one of these three; none sets its own colour or opacity.

**Four things that stand on the screen (the human named them):**
1. **The ring** (the prototype's right-click round buttons, `ring.ts`): one component, items from data, sub-rings for the complex operations. The large "gear menu" is the same ring with more items, not another widget.
2. **The bubble**: one component that stands at a place on the model or the sketch. Constraint bubbles and dimension (number) bubbles are two contents of it; shown only on what is selected; a refusal flashes the bubble and the parts red.
3. **The helper bar** (the prototype's `suggest.ts`): opens beside what was clicked, with an offset; suggested constraints on the right, actions on that thing on the left. It is the one place a suggestion appears.
4. **The ... menu**: the one list for everything that is not in the ring (import, export, settings, history).

Plus the sketching drawing the human liked, kept as it is in `interaction/style.ts` (dashed teal suggestion lines, teal picked, red flashing refusals, green applied).

**What leaves:** the prototype's nine ways to show a message and fifteen kinds of pill (`dec_ui_unification`) become the one bubble and a line at the bottom; the five kinds of handle become the mover (the next section, `mover_orb_requirements.md`).

**How:** the interaction layer makes a list of descriptions each frame (what to draw where, with which look and tone); the screen has one function per part and no knowledge of CAD. Order: looks, bubble, ring, helper bar, ... menu, wired to the engine's sketch and trim.

## Rationale

The prototype's polish came from the human's feedback and is worth keeping; its mess came from a widget per feature. One description and one drawer per part keeps both.

## Progress (`in_1563`: the human said to start with the looks and the bubble, and that click to trim is fine)
- **Looks built:** `src/looks.ts` (Solid, See-through, a mark: pick, clash, tie; numbers in `settings.looks`), and `world.ts` sets a body's colour and opacity only through it (`Drawing.looks`, by body id; `theme.bodyColor` is gone).
- **Bubble built:** `interaction/bubbles.ts` (the descriptions, from the solver's system and the selection; `retype` for a typed number), `bubbledraw.ts` (the one drawer), `interaction/bubbleplace.ts` (the prototype's placement, ported unchanged), the constraint icons ported to `icons.ts`. A constraint is shown when one of its parts is selected.
- **Sketch controller on the engine built (`in_1564`):** the figures are the engine's definition (`SketchParams`), one per plane, solved at every edit by the engine's solver with no kernel (`engine/definition.ts`, new; `engine/refusal.ts`, new; `engine/trim.ts` reads a definition through it, and the worker's trim question passes the kernel read for sketches that hold a body's edges). `interaction/drawing.ts` (pure: what a click does, snapping that joins figures, delete, D, retype), `sketchcontrol.ts` (the controller: Line, Rectangle, Circle, **Trim**; select, bubbles, one line of words at the bottom). Trim is in the pencil's ring; pointing shows the part a click takes in red.
- **Try it:** `bash tools/preview.sh next`, right click, the pencil. Checked by `dev/drawing-check.ts`, `dev/stress-drawing.ts` (about 1,500 random sessions clean) and, in the page, `dev/sketch-browser.ts`.
- **Helper bar built (`in_1565`):** `interaction/helperbar.ts` (descriptions: the relations that fit the selection on the right, numbers first, true ones marked, refused ones red with what holds them back, those that follow not offered; delete and put-away on the left), `helperbardraw.ts` (the one drawer, round buttons, beside the selection up and to the right, clear of the bubbles). **The first-drawn corner stays** when a number or relation changes the sketch (`keep` holds the oldest point, and solves without if it cannot). Checked by `dev/helperbar-check.ts` and `dev/sketch-browser.ts`.
- **Sketch to extrude built (`in_1566`):** the engine runs in a Web Worker in the page (`engine/webworker.ts`, `engine/host-web.ts`; the kernel's wasm found by the bundler; `initKernel(wasm)`), behind `studio.ts` (the recipe, one change after another, the body's mesh asked for). `interaction/extrude.ts` (pick a region, the steps), `extrudecontrol.ts` (the Extrude tool: the arrow is the mover's handle, a ghost, the number bubble, the check/cross), `opbar.ts` (the one operation bar), `world.ts` draws the engine's bodies and the ghost, `view.lookObliqueAt`. Checked by `dev/extrude-check.ts` (kernel, node) and `dev/extrude-browser.ts` (page: pick, pull the arrow, type 12, Enter, the engine makes the box).
- **Undo and the step list built (`in_1567`):** `interaction/undo.ts` (a history of whole states: the drawings and the recipe together), `interaction/steplist.ts` (rows with status and numbers; `editNumber`), `steplistdraw.ts` (the panel with the undo and redo buttons). The sketch controller says every change to the history; Ctrl or Cmd with Z, Shift+Z, Y. The engine's sketch step now solves with the first corner held too (`solveKeeping` in `engine/definition.ts`), and an extrude of no length is flagged in words (it hung the kernel). Checked by `dev/undo-steplist-check.ts` and `dev/undo-browser.ts`.
- **Picking on a body built (`in_1568`):** `interaction/pick.ts` (a face by the pointer's ray through the mesh, an edge by its distance on the screen, not through a face), `bodyselect.ts` (the pick, Shift for edges, hover and pick marks, the bar), `interaction/bodybar.ts` (Sketch on face, Push / pull; Round, Chamfer), `world.ts` marks (teal over the body). The engine's mesh now carries each face's and edge's id as data. **Actions:** Push / pull (the arrow, the face moved as the ghost, `push` step), Sketch on face (the engine's own face frame, `faceAxes` shared, a `sketch` step on the face then `combine` add or cut), Round and Chamfer (a size to type, `round` step). Checked by `dev/pick-check.ts` (kernel) and `dev/pick-browser.ts`, `dev/face-browser.ts`, `dev/round-browser.ts` (page).
- **The "..." menu built (`in_1569`):** `interaction/moremenu.ts` (the items and when each can be chosen), `moremenu.ts` (the round button top right and the list), `interaction/files.ts` (the document's text plus the drawings and the planes on faces; `fromFile` says in words what is wrong), `filesdraw.ts` (download and choose a file), `studio.ask` for the export. New, Open, Save, Export STL and STEP; New and Open are changes that undo takes back. Checked by `dev/files-check.ts` (kernel) and `dev/more-browser.ts` (page: save, both exports, new, undo, open, a bad file).
- **Dragging a sketch part built (`in_1570`):** `sketchcontrol.ts` `grab`/`grabMove`/`grabEnd` (the solver's pins: a point, both ends of a line, a circle's centre, an arc's points; a point snaps to another point or a curve and joins it on release; one undo for the whole drag; red flash and a sentence when constraints hold it back). Checked by `dev/drag-browser.ts` and drags added to `dev/stress-drawing.ts`.
- **The arc tool built (`in_1571`):** centre, start, end (`addArc`, `arcWay` in `interaction/drawing.ts`; the short way round; the engine's own arc), a preview as the pointer moves, in the pencil's ring. An arc is selected, dimensioned, dragged, trimmed and extruded in a region like any part. Checked by `dev/arc-browser.ts`, arcs in `dev/extrude-check.ts` (a half disc extrudes to pi r^2 / 2 * d) and in `dev/stress-drawing.ts`.
- **Not yet:** a three-point arc (start, end, a point on it), flipping an arc to the long way round, a circle's edge dragged to change its radius, a part, an arc tool, typing a size while drawing, undo, the sketch as a step of the document (its extrude), the gear items and the "..." menu.
