---
id: dec_clean_engine_design
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_093, in_094, in_095, in_096, in_099
date: 2026-11-05
depends_on:
  - inv_layer_adjacency: the engine is laid out in the human's layers (UI, Interaction, Operation, Geometry Compiler, Platform) and nothing reaches across them
  - prin_graph_is_truth: the saved thing is the graph of parts, relations and steps; geometry and body parts are derived
  - dec_interaction_spec: the behaviours any rebuild must reproduce; it is the acceptance list
  - dec_no_sketch_isolation: no sketch mode: every part can be selected and related at any time
  - dec_relations_standard: one table of relations by kind of part, the first selected moves to the one selected after it (`in_229`)
  - dec_constraint_ownership: every relation is owned by one place and names the parts it uses
  - dec_stable_references: parts of the body are found again by name, with position as the fallback
  - dec_kernel_hybrid: the engine talks to the geometry kernel only through the adapter that already exists
---
# The clean engine: one kind of part, one selection, one table of actions

The prototype taught what the product is (`in_093`: "we know we want a system that is entirely free set of just lines vertices and faces all of which could be worked on in the same manner"). This is the design for rebuilding it clean, with the prototype kept as a frozen reference. Accepted with the four proposals of section 12 (`in_099`: "yes, go with those four proposals, lets build it"); code outside `prototypes/` may now be written under it (`dec_prototyping_policy`). The layer order below follows the blueprint: the geometry compiler reads the operation layer and the operation layer knows nothing of the compiler.

## 1. The layers (the human's, `inv_layer_adjacency`) and what lives in each

| Layer | Holds | Notes |
|---|---|---|
| **Platform** | pointer, wheel, key and touch events; storage; clipboard; the file format on disk | one implementation per target (`dec_platform_web_portable`) |
| **UI** | drawing (three.js), the world dressing (axes, panes, compass), the ring highlight, menus, number chips, the cursor readout, the look values | displays; decides nothing (`inv_no_logic_in_ui`) |
| **Interaction** | intents, click grammar, selection, picking (the candidate list), camera controller (orbit about the model, ortho when straight, X Y Z N), what can I do with this selection (the actions service), drawing tools as state machines | pure logic, testable without a screen |
| **Geometry compiler** | solves relations into positions (the 2D solver, per plane), builds the kernel graph, calls the kernel adapter, turns the result back into body parts | `src/kernel/` and `src/solver/` as they are |
| **Operation** | the scene: parts, relations, steps (features); commands; undo and redo (additive history); the ownership map | the graph that is saved (`prin_graph_is_truth`) |

The support layers `math` (pure vector and plane maths, imports nothing) and `shared` (refs, results, the event bus) may be imported by every layer above them; the operation layer needs vectors for the positions of parts.

Data flows down by calls, events up through one event bus. If a layer needs something from a non-adjacent layer, an interface method is missing.

## 2. The one part interface

Everything you can select is a **part**: a plain data record plus a registry of pure functions per kind (not a class tree, so it saves as JSON).

- `ref`: a stable name. Drawn parts: `d/<id>` (`d/e_001.p1`). Body parts: `b/<step>/<kind>@<name or position>` (a corner by how it was built, with its position as the fallback, `dec_stable_references`). World parts: `w/X`, `w/XY`.
- `kind`: `corner`, `line`, `circle`, `face`, `plane`, `axis`, `body`.
- `origin`: `drawn` (it is data in the scene and can move), `body` (derived from the kernel result: always a reference), `world` (always a reference).
- `plane`: the plane a drawn part lies on (or null). **A sketch is not a thing: it is only this field.** A closed loop of lines on a plane is a derived `face`.
- Geometry in 3D (`point`, `segment`, `circle`, `outline`), the same accessors for every kind, so picking, drawing and relations never ask where a part came from.
- `movable`: true for drawn parts only.
Per-kind functions (one registry, one file per kind): `hit(part, pointer, view) -> distance | null`, `outline(part) -> draw hints`, `anchors(part) -> corners it contains`.

## 3. The scene and the relations

- **Scene** = planes, drawn parts (corners, lines between corners, circles), steps (extrude, fillet or chamfer of a set of lines, move, rotate, scale, delete...), and the **relations** list. A step names the parts it uses by `ref`; the kernel result is not saved.
- **Relation** = `{ id, kind, parts: [ref...] (ordered: first moves, second is the reference), value? , locked? }`. It is owned by the plane it is solved in (`dec_constraint_ownership`); the ownership map (who uses whom, broken ones) is derived from the list, never stored.
- The **table** (`dec_relations_standard`, `relations.mjs` today) is generalised from relations to **actions**: for the kinds of the selected parts it returns every relation and every operation that applies (round, bevel, extrude, move, rotate, scale, delete, look straight...), each with a label, an icon key, enabled or why not, a measure if it has a number, and `run(scene) -> command`. The menu, the number chip, the keyboard and the touch long-press all ask this one service.

## 4. Selection, picking, the click grammar (`dec_interaction_spec`)

- **Selection** is an ordered list of `ref`s (first = mover, second = reference). Pure functions: `select`, `extend` (Shift), `toggle`, `clear`, `cycle`. Nothing else holds selection state.
- **Picking** is one function: `candidatesAt(pointer, view, scene, bodyParts) -> [candidate]`, ordered corners, lines, faces and planes (a shape before the face under it). Hover is the first candidate. A repeated click at the same spot with the same list takes the next (`in_088`).
- **Click grammar** lives in the input layer's mapping, not in tools: one click -> `select`, two -> `lookStraight(plane)`, three -> `selectObject`; where the candidate list has more than one entry, repeated clicks -> `cycle`. Shift -> `extend`.

## 5. Input as intents (`prin_input_agnostic`)

Device events become a small set of intents by data tables (mouse, trackpad, finger, pen): `select(at)`, `extend(at)`, `lookStraight(at)`, `selectObject(at)`, `cycle(at)`, `orbit(dx, dy)`, `pan(dx, dy)`, `zoom(k, at)`, `menu(at)`, `draw(point)`, `type(char)`, `escape`. A scroll classifier (trackpad or wheel) is part of the mapping. No tool or part code mentions a device.

## 6. Commands and history

Every change is a command on the scene (add part, move part, add relation, change value, add step...). Undo and redo are a stack of commands. Derived refreshes (pins following a rebuilt body) are not commands. Deleting a part removes the relations that used it in the same command, so undo restores both.

## 7. Geometry compiler

1. For each plane, build the 2D model from its drawn parts and add the parts it refers to that live elsewhere (body corners, lines, other planes' parts) as **fixed virtual parts** at their projection on that plane.
2. Turn the relations into solver constraints (the existing types plus `ptLineDist`, `lineGap`, direction and pin types become ordinary constraints on virtual parts); the second part of a relation is held softly so the first moves.
3. Solve; write positions back as a derived layer over the drawn parts (they are the stored positions).
4. Build the kernel graph from steps and closed loops (`features.mjs` today), call the adapter (`src/kernel/`), turn the result into body parts with stable names.

## 8. View

A thin three.js layer: `world` (axes, panes, compass, the grid on the plane you look straight at), `camera` (a controller driven by intents: orbit about the model without re-centring, ortho when straight, X Y Z N, zoom to cursor, home, return to origin), `parts` (draws any part from its `outline`), `highlight` (the ring and the teal, `orb.js`), `ui` (menu, chips, readout, the ⋯ button). It reads the scene and the selection and never mutates them.

## 9. What happens to each file of the prototype

| Keep as it is | Port (moves, adapts) | Rewrite | Drop |
|---|---|---|---|
| `solver/solver.mjs`, `kernel/**`, `viewmath.mjs`, `keymap.mjs`, `orb.js`, `expr.mjs`, `sketch.mjs` (snapping and hit tests), `icons.mjs`, the look and input values of `settings.js` | `sketchsolve.mjs` (build the 2D model from parts and virtual parts), `relations.mjs` (becomes the actions service), `constraintmap.mjs`, `sketchpick.mjs` (`elementsAt` becomes per-kind `hit`), `features.mjs`, `extrude.mjs` and `transform.mjs` (become operations), `actionbar.mjs` (replaced by the actions service), `body.js` (kernel client plus body parts; drawing moves to the view), the tests | `main.js` (about 2,600 lines), `interaction.mjs` (the sketch session), `sketchstore.mjs` | the sketch mode and `selected`, `session.picks` / `sel` / `ext` as separate stores, `armedTool`, the four ways of finding what is under the pointer, `store.cons` and feature constraints as separate lists, old themes and styles, the tuning panel, the hidden history panel's code (rebuilt later) |

## 10. Order of work (each phase passes a named slice of the spec; something runs at the end of each)

1. **Core, no screen:** part registry, scene, relations list, commands and history, ownership map, selection, tests ported. *Passes:* selection grammar (selection part), relations and distances, mover and reference, delete with constraints and undo.
2. **Compiler:** solve per plane with virtual parts; kernel graph; body parts with stable names. *Passes:* pins and parallel to body parts that follow the body; extrude and round several lines at once (kernel tests already exist).
3. **Picking contract:** `candidatesAt` over scene and body parts, cycling, hover. *Passes:* overlaps, cycling, picking a sketch's parts as easily as the body's.
4. **Minimal view:** world, camera controller, parts drawn, hover ring and selection teal. *Passes:* look, camera (orbit about the model, ortho, X Y Z N), highlight.
5. **Input layer:** the device tables and the click grammar. *Passes:* the devices section, double and triple click.
6. **Drawing and operations:** the tools (one figure then select), typed sizes, extrude, fillet and chamfer, move and rotate, delete, undo.
7. **The relations UI as it stands (menu, `DIST` chip), then the human's chosen constraints UI.**
8. **Cut over:** the clean app becomes the thing `tools/preview.sh` runs; the prototype stays frozen with its README saying what it taught.

## 11. Risks

A rewrite takes longer than it looks and tempts adding features. Limits: the keep list above, the phase order (something runs after each), and the rule that nothing is added that is not in `dec_interaction_spec` or the phase list. The risk of losing tuned feel is handled by keeping the look and input values and by writing the spec first. Body-part stable names depend on kernel work (`dec_stable_references` is decided but not built): phase 2 builds it with a position fallback first.

## 12. The four questions, decided (`in_099`)
1. The new code lives in a top-level `app/` (done: scaffolded, with its own `package.json`); the prototype stays under `prototypes/cad-ui`.
2. TypeScript, run by Node's type stripping in tests, type checked by `tsc`; the same test runner (`node:test`).
3. The prototype is frozen when phase 4 runs (blocker fixes only after that).
4. The drop list in section 9 stands.

## 13. Real apps on other systems (`in_096`)

The "same app on every system" is already the plan in `dec_platform_web_portable`: one web-technology codebase, wrapped. No second language is needed.
- **Desktop (Windows, Mac, Linux):** wrap the web app with Tauri (small, uses the system web view) or Electron (bigger, the same browser everywhere). Same code.
- **Android and iOS:** a wrapper such as Capacitor (or Tauri mobile), or first an installable web app (PWA) that works on the phone today. Same code, a touch input profile (already built into the interaction layer).
- **Why not another language:** a native UI per system (Kotlin, Swift, C#) means rewriting the view and the input for each, and losing three.js and the geometry kernel compiled to WASM. Rust or C++ compiled to WASM is worth it only for the parts where speed will matter (the kernel, maybe the solver), behind the interfaces we already have.

What to do now so this stays easy (all of it is cheap now and expensive later):
1. **TypeScript** for the rebuild (above).
2. **Keep the core free of the browser:** the Operation, Interaction and Geometry layers import no DOM, no `window`, no Node-only API (the layer rule already says so; add an import check).
3. **Write the Platform interface in phase 1** (files, storage, clipboard, license, pointer/key events, share) with one web implementation; later shells add theirs. Do not call the browser File System Access API outside it (Safari and the mobile web views lack it).
4. **Keep the kernel in a worker behind the adapter** (it is already), so a native kernel can replace the WASM one for desktop later.
5. **Test on a phone web view early** (a real Android and an iPhone): memory limits for WASM (the OCCT file is large) and WebGL behaviour differ there; phase 4 should include that check.
6. **Licenses:** OCCT is LGPL, which needs the packaging care in `docs/licenses.md` once the app is distributed in a store or as a binary (relinking must be possible).
Known limits: the WASM kernel is slower than native and capped in memory (more so on phones), the app stores charge fees, and a wrapped web app feels less native than a hand-built one.

## Rationale

The prototype has four selection stores, four ways of finding what is under the pointer, two stores of constraints and a mode that no longer exists, because each new rule was added to what was there. One part interface, one selection, one picking function and one actions table remove the places where those can disagree, so a rule added once works for every kind of part on every device. The layering is the human's own, and the kernel adapter, the solver, the view maths and the look are kept, so the cost is the glue, not the ideas.
