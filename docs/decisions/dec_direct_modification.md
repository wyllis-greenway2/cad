---
id: dec_direct_modification
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_041
date: 2026-11-04
---
# Direct modification is a growing list of operations that stay valid

Modifying the body directly (moving, rotating, rounding, tapering what is selected) is built as a **list of specific operations**, each made from
kernel pieces that already handle curves (prisms, wedges, rings, fillets, chamfers, add and cut), and each a replayable step in the history. A selection with
no valid operation says why instead of producing a broken solid. We do **not** rebuild flat-faced bodies from their planes: that works only while every face is flat
and would be a second geometry engine.

Current list: whole body move, rotate, scale; flat face move (in or out) and tilt; line fillet and chamfer; full round face radius and taper. Not offered: moving
a line or a corner (it reshapes the neighbouring faces; no valid general operation), rotating a corner.

The human approved this approach after the AI's recommendation (`in_041`). Which operations come next is the human's call. How a modification relates to the sketch that made the face is settled in `dec_modifications_are_steps`: it appends a step and never edits the sketch.

## Rationale

Solid kernels (OCCT here) offer booleans, offsets, fillets and drafts, not a general "tweak a face and re-intersect its neighbours". A list of operations built from
those pieces works the same for flat and round faces, can be tested against closed-form volumes (`prototypes/cad-ui/test/kernel.test.mjs`), and matches how Shapr3D and Fusion
behave (faces and lines where valid, no free corner moves on solids).
