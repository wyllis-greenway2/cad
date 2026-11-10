---
id: dec_independent_bodies
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_269
date: 2026-11-10
depends_on:
  - dec_stable_references: a body needs a name that stays when the model is edited, and its faces and edges are named under it; a change to how references are named changes how bodies are named
  - dec_export_stl: the export takes the final body today; with several bodies it needs to say which (that entry's question 5 was left open for this)
---
# Independent bodies, and Add and Subtract (draft, for the human to answer)

**Status: a draft written from `in_269`; nothing here is built (the Ungroup button in the suggestion bubble, asked in the same message, is built, Handoff 254).** Rule 3 of `CLAUDE.md`: it stays `provisional` until the human answers.

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

## Questions for the human

1. Identity (recommended) or shape (connected solid) as the rule?
2. An extrusion that touches a body joins it, one that does not makes a new one: right?
3. Subtract consumes the tools (recommended), or keeps them?
4. Export: all bodies in one file by default?
5. Start with step (1)?

## Rationale

The human found that two separated bodies cannot be selected apart (`in_269`). That follows from the model having one body, so the fix is a different model, not a selection tweak; it touches the kernel interface, the file and every operation on the body, so it is drafted for an answer before it is built.
