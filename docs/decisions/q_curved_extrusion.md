---
id: q_curved_extrusion
kind: question
status: open
origin: ai-unreviewed
human_input: in_442, in_443
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

**After `in_443` (the human asked whether the skin is just the hollow tool, and what a sweep is against a bend):**
- *Skin and hollow:* mostly yes. Hollow already makes a constant-thickness wall from a face's shape, but inward, for a whole body. The skin is the same wall grown outward from one selected patch. So the proposal is no new tool: give hollow (or offset) an outward direction and a "this patch only" scope. Reading 2 is dropped as a separate tool unless the human wants more than that.
- *Sweep and bend:* for a bar of constant section bent along an arc the result is the same. The difference is the input: a sweep builds a **new** solid from a profile carried along a path (any path, the profile is the only thing that must be closed and flat); a bend **deforms an existing** body about an axis (any shape, holes and all, stretched on the outside and squeezed on the inside). The kernel can sweep exactly; it has no exact bend, and a bent body would need its faces approximated. So reading 3 is dropped too unless asked for; the revolve with an advance already covers the screw-shaped bend.
- That leaves one new tool, the sweep, plus the outward option on hollow.

## Rationale
Written as a question because the request names an outcome and not the operation, and the three readings need different handles, steps and kernel calls.
