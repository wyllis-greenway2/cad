# The clean app (`app/`)

Production code for the rebuild described in `docs/decisions/dec_clean_engine_design.md`; the behaviours it must reproduce are in `docs/decisions/dec_interaction_spec.md`. The prototype in `prototypes/cad-ui` is frozen (its README says what it taught).

## Run it
From the repository root: `LAN=1 bash tools/preview.sh` (pulls, installs, starts the app and prints the address to open on a phone on the same Wi-Fi; `DEMO=0` starts empty, without `?demo=box`). Or here: `npm install && npm run dev`, then open `http://localhost:5173/?demo=box`.

## Check it
`npm run check` runs everything: `npm test` (node:test on TypeScript, no build step), `npm run typecheck` (tsc), `npm run layers` (the layer rules) and `npm run unused` (dead code: functions that are exported but unused, files nobody imports, names in the UI's window `interaction/api.ts` that the UI never uses). `npm run build` makes the static site in `dist/`.

## What you can do now
Look: orbit about the model (it stays where it is on screen), pan, zoom to the cursor, X Y Z N and H keys. Select: one click selects, two look straight at the plane, three select the object, Shift adds, repeated clicks on overlapping things cycle. Draw: R rectangle, C circle, L line (click a surface, click again or type sizes, Enter). Build with handles that show up by themselves when you select: a closed figure shows an arrow to pull it out (extrude), a flat face of the body the same arrow to push or pull it, lines of the body a double arrow each for a fillet (drag out) or a chamfer (drag in), the whole body its X Y Z arrows to move it. Drag a handle; type a number and press Enter for the same thing. Keys start them without selecting first: E extrude, F fillet / chamfer, M move (also a drawn figure), T rotate (a full ring round each axis and a centre you can place on a corner; a ring round the normal for a figure), K scale (a ball at the corner to pull). Click in blank space to leave an operation. Relations: select parts and use the menu or D for a number (measure, then lock); badges next to the selection show, edit, unlock and delete them. Ctrl+Z / Ctrl+Shift+Z undo and redo, Ctrl+S saves a `.cad.json` file, Ctrl+O opens one. Every load starts fresh (nothing is restored); save a file to keep your work. Right click, long press and the two-finger click open the menu. Mouse, trackpad, finger and (as a mouse) pen work; see `src/interaction/recognizer.ts` for the tables.

## Layers (`src/`, the human's layers, `inv_layer_adjacency`)
`math` (pure functions) - `operation` (the graph: parts, relations, steps, commands, history, the project file; the source of truth) - `compiler` (graph to geometry: the solver, the kernel adapter, the body parts) - `interaction` (selection, picking, intents, tools, operations, camera logic, the actions service, the controller) - `ui` (the three.js view, menu, chip, badges) - `platform` (device events, files, storage) - and `shared` (types, settings, the bus) which every layer may use. `src/main.ts` is the composition root that wires them.
Who may import whom is enforced by `tools/check_layers.py`. Only `ui`, `platform` and the root may use the browser (`window`, `document`, DOM, three.js); only `compiler/kernel/occt` may import the geometry library.

## Where things are
- A part is one record with per-kind functions (`operation/part.ts`); everything you can select is a part, whether drawn, from the body or from the world.
- One selection (`interaction/selection.ts`), one picking function (`interaction/picking.ts`), one table of relations and actions (`interaction/actions.ts`), one controller that applies an intent to the state (`interaction/controller.ts`, with the work in `interaction/control/`: `viewing`, `pointer`, `modal`).
- `shared/settings.ts` holds every tuned look and behaviour value (the human's, copied from the prototype).
- Tests are in `test/`, including the kernel conformance suite (`kernel-conformance.test.mjs`), which a replacement kernel must pass unchanged.
