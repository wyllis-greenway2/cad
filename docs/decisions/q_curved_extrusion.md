---
id: q_curved_extrusion
kind: question
status: open
origin: ai-unreviewed
human_input: in_442
date: 2026-11-15
depends_on:
alternative_to:
---
# A curved extrusion off any surface: which of three things is meant?

The human asked (`in_442`): "why cant i take any surface and make a curved extrusion off of it?" Nothing is built; this entry says why it does not work today and asks which is meant.

**Why not today.** An extrusion takes a flat figure and slides it along one straight line (its normal). Push / pull works on flat faces (and round walls by their radius). A curved face has no single normal, and the revolve (with its advance, `dec_spiral_extrude`) turns a figure about one axis, so neither can follow a path.

**Three things "curved extrusion off a surface" could mean**
1. **Sweep along a path:** the figure (a face, or a sketch) is carried along a drawn line, arc or spline, staying square to it. Needs a path to draw or pick, and a rule for the figure's turning (square to the path, or not turning).
2. **Extrude from a curved face:** the new material grows off a curved surface, along its normal at each point (a skin of constant thickness, like thicken / offset of that face) or straight along one direction.
3. **Bend the extrusion:** a straight extrusion that then curves (a twist or bend about an axis): partly covered by the revolve's advance.

**Recommendation (not a decision):** build 1 first (sweep of a selected face or closed sketch along a selected line, arc or sketch path, as a `sweep` step the kernel can do), then 2 as an offset of a selected curved face (a thickened shell patch), and leave 3. Which is it?

## Rationale
Written as a question because the request names an outcome and not the operation, and the three readings need different handles, steps and kernel calls.
