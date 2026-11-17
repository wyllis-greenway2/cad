---
id: dec_spline_and_cams
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_689
date: 2026-11-17
depends_on:
  - dec_sketch_lines_and_constraints: a spline is a new kind of side beside the line and the arc, and joins the corners and constraints that decision defines
  - dec_gear_tool: the cam helper is a new generator of that decision's kind, writing a figure the person can then edit
  - prin_manufacture_agnostic: nothing here is for one making route; a cam is a shape, its motion law a number set
alternative_to:
---
# A spline tool, curves made into arcs only when needed, and a cam helper that draws onto it

**Drafted at `in_689`, not yet approved.** The human asked for this entry to be drafted from the recommendation; the design itself has not been approved.

Sketch sides are only straight lines and circular arcs (`Line.bulge`, `operation/part.ts`), so a freeform shape such as a cam cannot be drawn by hand; the gear code only gets by because arcs fitted through points of a known curve are exact enough. Proposed, in this order:

1. **A spline side.** A smooth curve through points the person clicks, between corners like any side. It stores its **control points** (so it stays editable) and is drawn as its own curve. Constraints at first: its two end corners, and the tangent direction there (to meet a line or arc smoothly). Dimensions on its inside are left for later (`q_spline_storage`).
2. **Arcs only when the kernel needs them.** A spline is turned into a chain of arcs to a tolerance (a thousandth of the largest size, as the gear fit is) when an extrude, hole, offset or export needs a closed outline, and not before; the edges of the body then are arcs that can be picked and constrained as now. Trim and offset of a spline work on the same fitted chain.
3. **Ellipse**, after, as a smaller addition (angled cuts through cylinders, threads).
4. **A cam helper** (a generator in the Gear submenu's manner, `dec_gear_tool`): base radius, lift, rise, dwell and return angles, follower (knife edge, roller with its radius, flat), and a motion law (uniform, parabolic, simple harmonic, cycloidal, 3-4-5 polynomial). It writes a spline (or the fitted arcs) onto the sketch; the person then edits the points or keeps the numbers. Eccentric and snail cams need no spline and can be done first.

Ratchet wheels and pawls, Geneva drives and splines (the earlier list) are further generators of the gear tool's kind and need no new curve, so are separate entries.

## Rationale

A cam is defined by a motion law, not by a tooth standard, so it must be drawn as a freeform curve; a person who wants their own shape needs the same curve, and the helper becomes one more way to write it. Keeping control points keeps the curve editable; fitting arcs late keeps the kernel, picking, constraints and export unchanged (they know only lines and arcs, `inv_kernel_boundary`). The cost is that a spline's own dimensions are hard (`q_spline_storage`), which is why the first slice constrains only its ends and tangents.
