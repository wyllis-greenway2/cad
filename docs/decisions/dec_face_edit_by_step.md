---
id: dec_face_edit_by_step
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_173
date: 2026-11-06
depends_on:
alternative_to:
---
# Pulling or pushing a face the body already has changes the step that made it

A fresh sketch being extruded, or a face pulled into another body, is a pure extrusion or cut along its path (a prism added or cut). Grabbing a face the body **already has** does not add a prism: it changes the step that made the face, and the steps after it are worked out again, so no new faces are invented and the relations are kept. The end of an extrusion changes the extrusion's depth; the wall of an extruded circle (a post, or the wall of a hole) changes that circle's radius (or its locked diameter), so a chamfer on its rim goes with it. Where the step that made the face cannot be told, or the steps after it cannot take the new size, a prism is added as before, and the app says so.

Built: end of an extrusion, wall of an extruded circle (`interaction/faceedit.ts`, `runop.ts`). Not yet: the sides of an extruded rectangle (move the sketch line), fillet and chamfer faces (change the size), faces made by several steps. A step finds its edge again after a size change by the nearest edge to where it was, if clearly nearest (`resolveEdges` in the kernel).

## Rationale

The human described the behaviour wanted (the whole body narrower, chamfer included, no cut at the chamfer's start, `in_171`) and took the recommendation to edit the history (`in_173`) over moving the face and healing the neighbours geometrically, which the kernel has no ready tool for and which would eat the chamfer instead of carrying it along.
