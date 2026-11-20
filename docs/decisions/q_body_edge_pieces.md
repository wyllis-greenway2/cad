---
id: q_body_edge_pieces
kind: question
status: open
origin: ai-unreviewed
human_input: in_1351, in_1352, in_1358, in_1359
date: 2026-11-20
depends_on:
alternative_to:
---
# What should a figure made partly of the body's own edges be, once a step has been made from it?

**What is true (found with the human's `model_5.json`, `in_1358`, `in_1359`):** a face drawn on a body's face with lines across it is cut into pieces wherever the lines meet the body's edges (`dec_sketch_lines_and_constraints`, `in_1338`: the body's edges lying in the plane are lines like any other). A piece is a part of the drawing, **derived from the lines and the body's edges as they are now**, named after them (`d/arc@body/e@33.53,22.14,25~...`). Pull pieces down (a cut, a pocket) and the step is made; but the cut changes the very edges the pieces were named after and made of, so **after the step the pieces cannot be derived any more**. Checked on the plain kernel (no lag): the step is made and shown, and then **every later change to the model, even typing the same number, leaves the step with "a part of this step is gone"** (`errors` of the compile; no message is shown). A diameter change is one such change: with the diameter increased the pulled pieces are not "no longer enclosed", they are lost whatever the size. Opening a saved file works (the steps are made one at a time, each against the body before it), which is why it is not seen at once. Fixed already, not this: a stale kernel answer (`in_1351`) and the commas in the names (`in_1358`).

**Not a naming problem (tried and taken out, `in_1359`):** naming a body's edge by its lasting name (`Line.stable`: `x_s_002:end|x_s_002:side:d/e_001.k`) instead of by its place works as a name, but the pieces are still derived from the body **after** the step, which no longer has those edges. A step that uses a figure of the body's edges needs the figure as it was **before** the step.

**Options**
- **A. The step takes its figure as drawn parts (materialize).** When the step is made, the body's edge pieces it uses are copied into the sketch as lines and arcs of its own (with a relation to the edge they came from: concentric / on the circle, as a hand-drawn arc on the rim would have). The step then depends on drawn parts only; the body can change. Simple to build and to understand ("the edges of the model that take part in the sketch are part of the sketch"). **A change to the diameter does not move the figure** unless the relation holds it (a circle's radius cannot be tied to another edge's today), so it is a copy, not a follower.
- **B. The step keeps the figure's shape.** The step stores the points and arcs of its pieces as they were; the figure is a fixed shape in the plane. Same stability, no new parts, no relation to the edge; the figure also does not follow a diameter change.
- **C. The figure is derived against the body before the step.** Pieces are derived (as now) for a step from the body **as it was before that step** (the kernel's answer for the steps before it), by lasting names, so a diameter change changes the pieces and the step follows; a diameter that leaves a piece with nothing to cut says "the figure is gone" with the reason. The parametric answer. Large: derivation per step, against a body that is not the final one, in the compiler and in every place that reads the pieces (selection, the hidden sketch of a used figure, ghosts).

**The AI's view (not decided):** A or B first (stable now, small), C only if following the diameter is wanted. Which is wanted is the human's: the figure that follows (C), or one that is made when the step is and stays (A, B).

## Rationale

The question decides what a body's edge in a sketch is: a reference that follows the body, or a line copied into the sketch. The two give different models: one parametric and fragile, one fixed and sturdy.
