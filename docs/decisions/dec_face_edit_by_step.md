---
id: dec_face_edit_by_step
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_173, in_320
date: 2026-11-06
depends_on:
alternative_to:
---
# Pulling or pushing a face the body already has changes the step that made it

A fresh sketch being extruded, or a face pulled into another body, is a pure extrusion or cut along its path (a prism added or cut). Grabbing a face the body **already has** does not add a prism: it changes the step that made the face, and the steps after it are worked out again, so no new faces are invented and the relations are kept. The end of an extrusion changes the extrusion's depth; the wall of an extruded circle (a post, or the wall of a hole) changes that circle's radius (or its locked diameter), so a chamfer on its rim goes with it. Where the step that made the face cannot be told, or the steps after it cannot take the new size, a prism is added as before, and the app says so. **Exception (`in_208`):** the side of an extruded sketch that cannot move (constraints hold it, or the steps after it cannot take it) is refused: no prism is added, the sketch stays, and the constraints around the side flash.

Built (`interaction/faceedit.ts`, `runop.ts`): the end of an extrusion (its depth); the wall of an extruded circle, a post or a hole (the circle's radius or locked diameter); the side of an extruded sketch (its corners on that side move along the face's outward normal, and a locked length that would put them back counts as "cannot": refused, the constraints flash, `in_208`); a fillet or chamfer face (the size of the step: pulling out, towards the sharp corner, makes it smaller); the end of a push / pull prism step from before (its depth). Several faces selected together still use prisms. A step finds its edge again after a size change by the nearest edge to where it was, if clearly nearest (`resolveEdges` in the kernel). If the kernel on its own thread answers late that an edit broke a later step, the edit is taken back and the prism is made instead.


**Figures made together (`in_320`, `in_322`).** New extrusions no longer make any: separate figures selected together are extruded in one go but each is a step, and so a body, of its own with its own height (`dec_independent_bodies`). Files made before have steps with several figures (`also`); for those, pulling the end of one figure changes only that figure: the step has a `depth` for the first figure and `alsoDepth` (`a|b`, in the order of `also`) for the others, a sibling with none using `depth`; pulling a face writes every figure's depth, so the others keep theirs (`faceedit.ts`, `figureDepths` in `operation/scene.ts`, the kernel's extrude takes a distance per sibling), and the figure is told by where the face stands (its middle lies over that figure's sketch). An old shared step still has the limits of before: a figure made of arcs only is not told apart, and moving the second body of one does not carry its sketch.

## Rationale

The human described the behaviour wanted (the whole body narrower, chamfer included, no cut at the chamfer's start, `in_171`) and took the recommendation to edit the history (`in_173`) over moving the face and healing the neighbours geometrically, which the kernel has no ready tool for and which would eat the chamfer instead of carrying it along.
