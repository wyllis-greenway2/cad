---
id: q_motion_probe_domain
kind: question
status: open
origin: ai-unreviewed
human_input: in_1625
date: 2026-11-26
depends_on:
alternative_to:
---
# One motion, one probe, one domain interface: how to clean the interaction code as bodies come in (proposed)

The human asks (`in_1625`) how to clean the whole thing up, whether generic mover functions should serve all movement in 2D and 3D, whether the code should be split along those lines as bodies come in, and whether suggestions and constraints should overlap more. Proposed, nothing built, nothing approved:

1. **Motion** (what moves, by how much): a dragged thing is a set of parts that move together by a few numbers `q` (a plane drag: 2 numbers; an arrow along an axis, a pull of a face, a turn about an axis: 1 each; free: 3 or 6), with a function from `q` to where the parts are. The sketch drags (`piece`, a line end, a circle edge) and the body orb and pull arrow are all this. The mapping from the pointer to `q` (`alongLine`, `onPlane`, the ring, the screen-based pull) is one shared module.
2. **Probe** (what is near): one question, "for these parts at `q`, which relations from the table fit, would be accepted by the solver, and are within reach, and where does `q` land": it replaces the separate hints (`helpersAt`), offers (`offersFor`, `nearFor`, `barFor`) and the in-range estimate (`snapEstimate`). Reach is the only difference between a drag (near), a selection (unlimited for a chosen pair) and a part at rest (exactly true or in range).
3. **Domain** (what a relation is): an interface for a world with parts, a relation table, residuals and a solver verdict. The sketch is the first domain (`RELATIONS`, `solver.ts`); the body mates (`placement.ts`, `MATE_NEEDS`) are the second and run the same marks, scope, anchor, active and refused rules once they implement it. Do not build the interface before the second domain needs it; write the sketch's side so that it can be it.
4. **Marks, handles and tasks stay as they are** and read all three.

Order, each step keeping the fast checks and the drag page check green: (a) mechanical: reformat the long lines and split `sketchcontrol.ts` into drawing, dragging and marks; (b) motion and probe, 2D first; (c) the body orb and the pull arrow onto motion and probe (the payoff: snapping a pull to flush with another face); (d) the domain interface when mates get the marks.

## Rationale

Every case added lately (a piece, a corner of several lines, an arc, a circle edge) was a branch of one idea: something moves by a few numbers and the relations it could land on are looked for. Naming that idea once is what stops each new feature from adding a branch.

## Step (a) done (`in_1626`)
The code is formatted (prettier, 120 columns, `npm run format`, recorded in `docs/licenses.md`: a development tool only; the source went from 8,365 to about 18,000 lines with no line a wall of code), the imports are sorted and the unused ones removed (84 files), `sketchcontrol.ts` is split into `sketchcore.ts` (the sketches, what they solve to, the shared helpers and the short-lived refusal and active state), `sketchdrag.ts` (grab, move and end of a drag, the hints a drag draws), `sketchmarks.ts` (the marks and what their buttons do, the relation put on the selection) and `sketchcontrol.ts` (the tools, the preview, the figure's numbers, the composition): 880 lines became 473, 146, 208 and 186. The old timed-offer fields of a bubble and the unused `ToolControl` type are gone and the two old headers (`bubbles.ts`, `infobar.ts`) say what the files are now. Behaviour is unchanged: `npm run checks` (43), the 60 unit tests and all 14 page checks pass.

## Step (b) built, in part (`in_1627`)
`next/src/engine/probe.ts` is the one probe: a **motion** (`dim`, `at(q)` the system with the parts moved by the offset `q`, `affected` the parts it moves and what is made of them: `adjusting` each point and radius free by numbers of its own, `translating` points together), `candidatesFor` (the relations of the table that name an affected part, each once, with the order that breaks ties), `landN` (the least-norm Newton step `-J^T (J J^T)^-1 r` for one or two rows in any number of numbers), `aboutMotion` (a relation the same whatever the numbers are is not a hint), `inRange` (in reach, depends on the motion, the solver would add it). **Now on it:** the selection's near offers (`nearFor` is `inRange` over `adjusting`, so a direction relation a little off, such as parallel, is offered too; the separate loop and `snapEstimate` are gone) and the drag of a vertex, a line, an arc or a circle by its centre (`helpersForMotion`, over the real sketch: no copies, no parts taken out, the constraints that already name the part count as already said; the figures `piece` and `more`, `freeOfDrag`, `pieceOf` are deleted). **Still on the old figures (`engine/free.ts`):** a figure being drawn (its parts do not exist yet, so a motion needs the sketch with temporary parts added), the typed numbers (`typed.ts`), and a circle's or an arc's edge (a radius motion, one number). Next: drawing and the radius motion onto the probe, then `free.ts` can go. `dev/probe-check.ts` (10 cases); `npm run checks` (44), the 60 unit tests and the drag, drag-hints, sketch, tangent, typed, arc, undo and leftovers page checks pass.
