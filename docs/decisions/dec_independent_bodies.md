---
id: dec_independent_bodies
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_269, in_270
date: 2026-11-10
depends_on:
  - dec_stable_references: a body needs a name that stays when the model is edited, and its faces and edges are named under it; a change to how references are named changes how bodies are named
  - dec_export_stl: the export takes the final body today; with several bodies it needs to say which (that entry's question 5 was left open for this)
---
# Independent bodies, and Add and Subtract

**Status: accepted** (`in_270`: "take your recommendations on all five", with the refinement below). Steps (1) to (3) of the order below are built; see the end.

## What is true today

The model has **one body**: the final solid of the history. All of it is one object (`BODY_OBJECT`, `b/body/o`); two pieces that do not touch are one compound to the app, so the third click selects both, Move and Rotate move both, and a fillet or chamfer or push / pull can only be told apart by the faces and edges themselves. Repeating the body joins the copies into it (or leaves them as one compound when they stand apart).

## What I think the rule should be

**A body is something you can pick up: a solid that stays one thing until you combine or cut it.** Two answers to "what makes a body independent", and I recommend the second:
1. *By shape (a connected solid):* two solids are independent exactly when they do not touch. Simple, and nothing to manage; but moving one onto the other would fuse them at once, there is no way to have two overlapping bodies, and there is nothing for Add to do.
2. **By identity (recommended):** a body is a thing the model remembers by a name. A new body is made when a sketch is extruded where it does **not** touch an existing body, or when a body is copied or repeated; an extrusion that touches a body **joins it** (as now), and a cut cuts the body it goes into. Separated bodies are therefore always independent (your first point), and bodies that were made apart **stay apart** if moved to touch or overlap, until you ask to combine them. This is how most CAD programs work, it is what makes Add and Subtract mean something, and a group (`dec_selection_tools`) stays what it is: a selection that holds together, not a body.

## How it would work (recommendation)

- **Names:** a body is named after the step that made it (`b/s_137/…` for its faces and edges), so it keeps its name through edits. When bodies are added together the result keeps the older name; when a cut splits one, the larger piece keeps the name and the other gets a new one (`s_137.2`).
- **Selecting:** the third click, and the Bodies list, take **one body**. A group can hold bodies, so several can be selected together and still be separate.
- **Operations:** Move, Turn, Scale, Copy and the repeats act on the **selected body** (today: the only one). A step that changes a body says which one by its name.
- **Add (boolean union):** with two or more bodies selected, joins them into the first one (the others are consumed). If they do not touch or overlap it says so and does nothing: they could not be one solid.
- **Subtract:** the first selected body minus the others; the others are consumed (undo brings them back). "Keep the tool" as an option later.
- **Intersect** is the same shape of operation and could follow.
- **Overlapping bodies** are allowed to exist (shown as they are); the STL export of such a model has the overlap in it, and the result line would say so.
- **Export:** one file with all bodies by default, or one file for the selected body; `dec_export_stl`'s question 5.
- **Kernel:** the graph keeps a list of solids with their names instead of one final solid; each answer gives a mesh, faces and edges per body. This is the largest part: the kernel interface, the compiler's body parts, selection and the history panel, the file (steps name their body), the fuzzer and the tests.

## Order I would build it in

(1) bodies as named solids that are selected one at a time (separated ones only: no overlap yet); (2) Move, Turn, Scale, Copy on the selected body; (3) Add and Subtract; (4) export of all or one body; (5) Intersect and "keep the tool".

## Questions that were asked (answered by taking the recommendation, `in_270`)

1. Identity (recommended) or shape (connected solid) as the rule?
2. An extrusion that touches a body joins it, one that does not makes a new one: right?
3. Subtract consumes the tools (recommended), or keeps them?
4. Export: all bodies in one file by default?
5. Start with step (1)?

## Rationale

The human found that two separated bodies cannot be selected apart (`in_269`). That follows from the model having one body, so the fix is a different model, not a selection tweak; it touches the kernel interface, the file and every operation on the body, so it is drafted for an answer before it is built.


## Refinement by the human (`in_270`)
Joining or cutting another body happens **only on the first drag of a sketch into an extrusion** (the initial extrusion: it joins a body it touches and cuts a body it goes into, as before). **Later drags and face pulls change that body alone**, even if what is pulled goes into another body: they never join or cut it. Adding and subtracting bodies is done only by the boolean **Add** and **Subtract**.

## Built (`in_270`)
- **Kernel** (`compiler/kernel/occt/bodies.mjs`, `interpreter.mjs`, `evaluate.mjs`): a body is a solid of the final compound; each keeps a name through the history by a **marker** (a point inside it, the middle of its box, kept up to date; moved with it by a move, turn or scale): the solid that holds a body's marker is that body, a solid with none is a new body named by the operation that made it, a marker with no solid of its own is gone. `KernelResult.bodies` (name, box, volume), and each face and edge says which body it is in (`body`). Move, Turn and Scale take a `body` name and move only that solid (the others stay; overlapping bodies are allowed). Face and edge operations (`faceExtrude`, `faceTilt`, `cylRadius`, `cylDraft`, `edgeMod`) run on the body that holds what they name and leave the others alone. `combine` (Add: joins into the first, refused if they do not touch or overlap; Subtract: the first minus the others, which are used up).
- **App:** a body part for each body (a single body is still `b/body/o`; several are `b/<name>/o`, with `id`, `volume`, `bbox`), faces and edges say which body they are in (`of`); the third click and the Bodies list take one body; Move, Turn and Scale of a selected body make steps that name it (`params.body`; the drawn sketches are **not** carried along); **Add bodies** and **Subtract bodies** in the Shape group of the ring and the ⋯ list (two or more bodies selected; the first selected stays), the step `combine`. `test/bodies.test.ts`, `test/independent.test.ts`.
- **Then built (`in_271`):** Copy and the repeats take the selected body (the step names it; the copies are bodies of their own, or one body where they overlap, and the others are left alone); the sketches of the step that made a body go with it when it is moved, turned or scaled alone (the other bodies' stay); **Intersect** and "keep the tools" (Subtract and Intersect, tools kept) as `combine` modes; the **export** takes all bodies by default and one or some when asked: the choice is one place (`exportScope` in `interaction/exportstl.ts`, and the kernel's `ExportQuality.bodies`), with an "Export the selected body as STL…" item when several bodies exist and one is selected. (Its first version showed a drag of one body of several by the kernel; `in_273` replaced that, below.) `test/independent.test.ts`, `test/bodies.test.ts`.
- **Smooth drag of one body (`in_273`):** the frame says which triangles (the faces the kernel gave to that body) and which box are the dragged body's (`Frame.bodySplit`); the view splits the mesh and the outline into a group of its own for the drag and moves only it by the matrix (`ui/view/content.ts` `split`, `ui/view.ts`); put back whole when it is let go. `test/independent.test.ts`.
- **Sketches drawn on a face of a body (`in_277`):** the plane made for drawing on a face names the body it is a face of (`Plane.body`; a plane is reused only for the same body, as bodies' faces can lie in one plane), and a move, turn or scale of that body alone carries them (and `laterMotion` counts it for an extrusion made from such a sketch). `test/independent.test.ts`.
- **Found with two cylinders (`in_291`), the places that still assumed one body:** **Delete** of one body took every body's steps; it now takes the step that made that body (`x_<step>` in its id) and the steps made on it alone, and with one body it still takes all. **Shift** on a selected whole body adds or takes out the whole body that is clicked (it added a face before). **The arrows and rings of Move and Turn** stand in the middle of the selected body (they stood in the middle of all). **The view turns about the body in view** (the body whose middle is nearest the line of sight, kept for the whole drag; with one body it is the middle of the model as before): turning about the point between two bodies far apart threw the one in view off the screen. **A body that is selected whole is dragged free by pressing on it**: it goes where the pointer goes on the plane through its middle that faces the camera, as one move step by a vector (`vx vy vz` in the step; the kernel, the markers and the picture all read it), the sketches of the body carried; the arrows still make exact moves. The **⋯ menu** now lists only what the ring does not (the app's own things).
- **Boolean menu (`in_294`):** Add and Cut replace Add / Subtract / Intersect / keep the tools: see `dec_boolean_cut`.
