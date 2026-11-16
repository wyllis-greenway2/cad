---
id: dec_sweep
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_529, in_442, in_443, in_444, in_445, in_459
date: 2026-11-15
depends_on:
alternative_to:
---
# Sweep: a closed sketch carried along a path

`in_442` asked why a curved extrusion cannot be made off any surface; the AI offered three readings (sweep along a path, a skin grown off a curved face, a bend), the human asked whether the skin is not the hollow tool and what a sweep is against a bend (`in_443`), and answered "Yes, build the sweep" (`in_444`). **Skin:** not a tool of its own: hollow already goes outward when its arrow is pulled the other way (negative thickness, `dec_hollow`). **Bend:** not built: it deforms an existing body and the kernel has no exact bend (the revolve's advance already gives the screw-shaped one).

**Built (`in_444`):** *Sweep* in the Shape menu with one closed sketch and the lines and arcs of an open path selected together. The path is one chain with two ends (a branch or a closed loop is refused with the reason); it may be drawn on any plane; it may be anywhere (`in_459`): its end nearer the sketch's plane is brought to the plane along the plane's normal and the shape stays where it is beside it, carried rigidly along the path's shape; it is refused only where it starts running along the plane (the shape would go edge on). The step is `sweep` (`usesFigures`: the sketch and the figures inside it, which are cut out, as a revolve has them); the path is stored as the names of its lines (`path`, joined by `,`) and read from the scene each time the model is compiled (`operation/path.ts` `walkPath`), so it follows a later edit of its sketch (`in_445`); a path line that is deleted is reported as gone. The kernel (`sweep` in `interpreter.mjs`) assembles the path from lines and three-point arcs and carries the shape with `genericSweep` (Frenet frame, right transitions at corners); added to the body, cut from it, or a body of its own as an extrude is (`mode`). No number and no chips: Enter makes the step.

**Preview (`in_445`):** while the operation is open the body it would make is drawn as for any operation (nothing is made until Enter) and the corner the shape is carried from is the amber dot (`sweepStart`). **Not built:** the path carried with a body it is drawn on when that body moves (the shape is), a twist or a scale along the path, a path that is a spline, choosing which end it starts from.

**Preview, again (`in_529`):** a sweep chosen first (nothing selected, `dec_menu_picking`) showed nothing while its shape and path were clicked, only the made body at the check; now what it would make is shown as soon as what is selected is enough (`pickingOp`, `frame.ts`; a loft chosen first too), and a sweep's preview, open or waiting, is drawn as a wireframe as the revolve's is, not as a made body.

## Rationale

The sweep is the one reading of "a curved extrusion" that needs a new kernel operation; the others were already covered or cannot be built exactly. Naming the path's lines (as the shape's are named) keeps it true to the drawing.
