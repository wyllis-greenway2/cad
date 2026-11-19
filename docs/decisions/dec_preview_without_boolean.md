---
id: dec_preview_without_boolean
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1060, in_1061, in_1062, in_1063, in_1064
date: 2026-11-19
depends_on:
  - dec_drag_preview_without_kernel: the picture while a size is set is the kernel's own answer for the step, made cheaper by flags; this adds one more way to make it cheaper and keeps the rule that the step made for good is the whole answer
  - dec_per_body_checks: a boolean works on the bodies the figure meets and the others are left as they are; this goes one step further, to a figure that meets none of them in fact
alternative_to:
---
# The preview of an extrusion leaves out the boolean for a figure that is apart from the bodies

**Chosen (`in_1064`, option 1 of `q_working_and_settled`):** while the depth of an extrusion is being set, the figure is drawn beside the unchanged bodies and the boolean is made when the value is accepted.
**What is built:** `opCommand(…, { preview: true })` marks the extrude step of a preview (`params.preview`, only on the command made for the picture, never on the step made for good); `graph.ts` carries it to the kernel's op; `interpreter.mjs` `OPS.extrude` sets `apartOk` for that op, and `apartFrom` (a section of the two shapes, which meets nowhere, and neither inside the box of the other) lets `fuseInto` and `cutOrAdd` return the pieces as they stand (a compound) instead of a trial cut and a fuse. Any doubt (touching, a figure that runs into a body, a box inside a box, a section that fails) says "not apart" and the boolean is made, as before. The answer is kept per pair of solids for the three questions one extrusion asks (the trial cut, the join, the start-behind test).
**Why only the preview:** the pieces left beside each other have the edges the prisms have (a circle's two halves, seams), not those the boolean leaves after it merges faces: made without it, a fixture's body had 12 edges for the 6 the boolean gives, and 1512 triangles for 1488. The picture is the same; the names and the faces and edges a person picks are not, so the step made for good keeps the boolean. A preview offers nothing to pick.
**Measured (Node, an arm round a pin over a two gear model, a preview at a new depth each time):** 224 ms a preview, 120 ms marked (47% less); the remaining time is the prism, the description of the answer and the page's own work. **In the built app** a scripted typing of the depth gave no difference that stands out from the noise (about 100 to 190 ms a step either way): the boolean is a smaller part of what the page waits for there.
**Tests:** `test/apartfuse.test.ts`: the preview is marked and the step made for good is not; an arm clear of the gear is made without the boolean (`apartSkipped` counts it) and has the picture (bodies, volumes, boxes) the step made for good has; one that goes down through the gear, and blocks beside, touching, running into and inside another, give the same picture.
**Not done:** the other kinds of preview (a revolve, a loft, a pattern); settling on deselect with a visible mark (`q_working_and_settled`); keeping the page's parts per body.

## Rationale

A preview is looked at, not picked from or built on, so what it must get right is the picture. The test for "apart" is exact where it says yes and conservative where it says no, so the cost of a mistake is a boolean made that need not have been, never a wrong picture; and the step made for good is made as before, so no name, face or edge changes.
