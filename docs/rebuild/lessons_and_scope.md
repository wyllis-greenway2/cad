# Cleanup: lessons and scope (DRAFT for the human to mark up)

Status: **draft, `ai-unreviewed`.** Written when a rebuild was being considered; the human then chose to clean up the existing app instead (`in_1395`), so read "rebuild" below as "the cleaned-up app": the lessons and the scope marks (CORE / LATER / PARKED) are the input to what is kept, trimmed or removed. Nothing here is decided. The human marks each item KEEP / DROP /
LATER / CHANGE, and only then does anything get built. The old app is parked on the branch
`prototype-v1` (the git tag could not be pushed from this environment). Work on the rebuild goes on
the branch `cleanup`. Written from the 162 `dec_` / 21 `q_` / 8 `prin_` / 6 `inv_` entries, the
blueprint (`docs/origin/CAD_Blueprint.original.md`), and the bugs met in the last sessions.

## 1. What went wrong (the reasons to rebuild)

- **Scope drifted far past the blueprint.** The blueprint's day-one list is sketch, extrude/revolve,
  booleans, fillet/chamfer/shell, patterns, mirror, STL/3MF/STEP, undo, history. The app also holds
  gear families (spur, bevel, spiral bevel, hypoid, crown, worm, planetary, Geneva, ratchet, pulleys),
  an engine with piston/rod/crankshaft makers, a parts library with fasteners and bearings, mates and
  mechanism motion, a CAM/manufacturing contract, touch aids, and more. About 100 of the 162 decisions
  are for these. Each is reasonable alone; together they are most of the code and most of the bugs.
- **50k lines of source and 39k lines of tests**, 291 test files. Tests grew one regression at a
  time and pin internals, so a deliberate change breaks unrelated tests, and a full run is too slow to
  use. (Measured: duplication is only 0.08%; the size is breadth, not copy-paste.)
- **Many ways to do one thing.** Go-normal had several paths until unified (`in_1378`); there were
  "a zillion" look modes until reduced to four (`in_1379`). The interaction layer (20k lines) is full
  of per-feature special cases; `inv_constraint_uniformity` exists because the human "constantly
  found exceptions" (`in_1086`).
- **Numbers that mean the same thing are rounded in different places**, so two parts of the app
  disagree by 1e-5 mm, and the kernel then fails (see lesson L1).

## 2. Lessons to build in from day one

Architecture rules that were good and should be kept (all were accepted by the human):

- **A1. The operation graph is the saved truth; geometry is derived** (`prin_graph_is_truth`).
- **A2. Layers with one-way flow** (UI, interaction, compiler, operations, platform;
  `inv_layer_adjacency`, `inv_no_logic_in_ui`, `inv_math_pure`), checked by script.
- **A3. Only one adapter touches the geometry library; plain data crosses** (`inv_kernel_boundary`).
- **A4. History is additive; an edit to the past is a deliberate, undoable act** (`prin_history_additive`).
- **A5. One rule for conflicts, with no exceptions** (`inv_constraint_uniformity`).
- **A6. Modeling knows nothing about the manufacturing route** (`prin_manufacture_agnostic`).
- **A7. Every interaction works on mouse, trackpad, touch and pen** (`prin_input_agnostic`): intents
  first, devices as mappings.
- **A8. Parameters live in settings, no magic numbers** (`prin_variable_over_hardcoded`).

Technical traps found the hard way (each cost real time; the new design must make them impossible):

- **L1. One precision rule, one place.** Rounding at the app→kernel boundary (1e-6), in the kernel's
  body description (1e-4) and in edge/face names (coordinates in names) disagreed. A cutter corner
  1e-5 inside a curved face left a sliver the mesher could not triangulate: unmeshed faces
  (`dec_exact_rim_numbers`). *Rule:* exact numbers cross the boundary as numbers, never rounded copies;
  names are not built from coordinates; the kernel result is checked for validity and meshing before
  it is accepted (not retried after the fact).
- **L2. Stable references, not positions.** Faces and edges were found by position and name-from-
  coordinates; names flipped when numbers moved by 1e-4 (`dec_stable_references`, mate tests broke).
  *Rule:* a reference is an identity assigned by the operation that created the thing.
- **L3. Snapping stores no relation unless the user asks** (`in_1329`), and the sketch is app data,
  not kernel data (stored coordinates, constraint solver, anchors). Decide this once, early.
- **L4. One path for each behaviour.** Go-normal / cut-to-plane (`turnToPlane`), looks (solid,
  see-through, cut, marked), the preview of a field being edited (`marks`). A new feature uses the
  existing path or changes it; it never adds a parallel one.
- **L5. Previews must not need the kernel** (`dec_drag_preview_without_kernel`, `dec_preview_without_boolean`);
  dragging stays fast by showing a light stand-in and compiling only on release.
- **L6. Tests pin behaviour, not internals.** A test that checks what another change did on purpose
  gets updated in the same change (`in_1384`, CLAUDE.md rule 12). Prefer fewer, bigger, real-file
  tests (section 5).
- **L7. Retry loops hide bugs.** `cutChecked` / `meshedCut` retry a failed cut with other tolerances;
  useful as a stopgap, but a design that needs them is wrong.
- **L8. A first-class "model kind" interface** for makers (gear, rod, wheel) with the same hooks
  (parameters, preview marks, build, mate points), so a new kind adds a file and no special cases.

## 3. Proposed scope

Marks are the AI's proposal. The human decides.

**CORE (v1): must work, must be tested end to end.**
1. Sketch on the world planes and on flat faces: line, arc, circle, rectangle, polygon, slot; trim,
   mirror, offset; constraints (one solver, one rule set); typed dimensions; snapping and suggestions.
2. Solids: extrude (add/cut), revolve, boolean (add, cut, intersect), push/pull, fillet, chamfer, shell.
3. Patterns: linear, circular, mirror.
4. Steps and history: operation graph, undo/redo, history panel, edit a past step.
5. Files: native JSON save/load (old files open), autosave, STL export, 3MF, STEP, STL/STEP import as
   reference.
6. View: orbit/pan/zoom, go-normal with cut view, four looks, selection, measure.
7. Input: mouse, trackpad, touch, with one intent layer.
8. Named parameters.

**LATER (after the core is solid):** body mates and motion; loft, sweep; one gear (spur + a basic
tooth profile library); parts library (fasteners, bearings); cross-section; copy/paste.

**PARKED (stay on `prototype-v1`, rebuilt only if asked):** bevel / spiral / hypoid / crown / worm /
planetary gears, Geneva, ratchet, timing pulleys; engine, piston, rod, crankshaft makers; keyway and
hub/spoke makers; manufacturing/CAM contract and laser-outline route; world orb and game menu;
flying camera.

## 4. Questions for the human

1. Is the CORE list the right first target, or should mates/motion or a gear be in v1?
2. The engine and its parts: were they the product, or an exploration? (This decides whether they are
   PARKED or a later flagship maker.)
3. Touch: v1, or after desktop is solid?
4. Keep the old keys, menus and look, or redesign the interface while rebuilding? (Redesign is cheaper
   now than later.)
5. Technology: keep TypeScript, three.js, replicad/OpenCascade? (The adapter makes the kernel
   replaceable; the rest is a rebuild, not a stack change, unless you want one.)
6. Which saved files are must-keep golden models? (The cylinder-pockets file and the piston/rod files
   are candidates.)
7. Old files: must the new app open every file the old one saved, or only files from a stated cut-off?

## 5. How we will know it works

- **Golden models:** a few dozen real saved files from the old app, each with recorded results
  (volume, bounding box, face count, valid and fully meshed). They open and rebuild in the new app.
- **Scripted flows:** the CORE journeys driven through the real controller; the final model is checked.
- **Break-it-on-purpose:** each journey is shown to fail when its known bug is reintroduced
  (the sliver cut, the stuck dark part, the go-normal regression) before it counts as protection.
- **Fast set / full set:** solver and math tests run on every change; golden and flow tests run
  before a push. The fast set stays under about 30 seconds.

## 6. Budgets and guards (checked by script, from day one)

- Layer, kernel-boundary and manufacturing-boundary checks stay (`tools/check_*.py`).
- A source size budget per folder and per file (a file over ~600 lines needs a reason).
- A cap on test files and on the fast set's time.
- Unused-export check stays (`tools/check_unused.py`; `knip` found 25 unused exports now).
- Docs: `handoff.md` keeps recent entries only; superseded decisions are deleted (rule 7).

## 6b. Order of work

1. Human marks sections 3 and 4. 2. Write the architecture note (A1-A8, L1-L8 as code rules) and
accept it. 3. Thin vertical slice: sketch, extrude, mesh, save/load, in the real app, with golden
tests. 4. Grow one CORE journey at a time. 5. Open old files as the acceptance test.
