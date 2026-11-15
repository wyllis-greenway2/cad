---
id: dec_sweep
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_442, in_443, in_444, in_445
date: 2026-11-15
depends_on:
alternative_to:
---
# Sweep: a closed sketch carried along a path

`in_442` asked why a curved extrusion cannot be made off any surface; the AI offered three readings (sweep along a path, a skin grown off a curved face, a bend), the human asked whether the skin is not the hollow tool and what a sweep is against a bend (`in_443`), and answered "Yes, build the sweep" (`in_444`). **Skin:** not a tool of its own: hollow already goes outward when its arrow is pulled the other way (negative thickness, `dec_hollow`). **Bend:** not built: it deforms an existing body and the kernel has no exact bend (the revolve's advance already gives the screw-shaped one).

**Built (`in_444`):** *Sweep* in the Shape menu with one closed sketch and the lines and arcs of an open path selected together. The path is one chain with two ends (a branch or a closed loop is refused with the reason); it may be drawn on any plane; one of its ends must be on the sketch's plane (the path is walked from that end; it is reversed if the far end is the one on the plane, refused if neither is). The step is `sweep` (`usesFigures`: the sketch and the figures inside it, which are cut out, as a revolve has them); the path is stored as the names of its lines (`path`, joined by `,`) and read from the scene each time the model is compiled (`operation/path.ts` `walkPath`), so it follows a later edit of its sketch (`in_445`); a path line that is deleted is reported as gone. The kernel (`sweep` in `interpreter.mjs`) assembles the path from lines and three-point arcs and carries the shape with `genericSweep` (Frenet frame, right transitions at corners); added to the body, cut from it, or a body of its own as an extrude is (`mode`). No number and no chips: Enter makes the step.

**Preview (`in_445`):** while the operation is open the body it would make is drawn as for any operation (nothing is made until Enter) and the corner the shape is carried from is the amber dot (`sweepStart`). **Not built:** the path carried with a body it is drawn on when that body moves (the shape is), a twist or a scale along the path, a path that is a spline, choosing which end it starts from when both ends are on the plane.

## Rationale

The sweep is the one reading of "a curved extrusion" that needs a new kernel operation; the others were already covered or cannot be built exactly. Naming the path's lines (as the shape's are named) keeps it true to the drawing.
