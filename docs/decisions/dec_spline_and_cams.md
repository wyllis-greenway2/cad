---
id: dec_spline_and_cams
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_690, in_689
date: 2026-11-17
depends_on:
  - dec_sketch_lines_and_constraints: a spline is a new kind of side beside the line and the arc, and joins the corners and constraints that decision defines
  - dec_gear_tool: the cam helper is a new generator of that decision's kind, writing a figure the person can then edit
  - prin_manufacture_agnostic: nothing here is for one making route; a cam is a shape, its motion law a number set
alternative_to:
---
# A spline tool, curves made into arcs only when needed, and a cam helper that draws onto it

**Drafted at `in_689`; approved at `in_690`** (the human took the recommendation on how a spline is stored: control points, made into arcs only when the kernel needs them). What is built first is the spline with its ends constrained; dimensions along a curve are open (`q_spline_dimensions`).

Sketch sides are only straight lines and circular arcs (`Line.bulge`, `operation/part.ts`), so a freeform shape such as a cam cannot be drawn by hand; the gear code only gets by because arcs fitted through points of a known curve are exact enough. Proposed, in this order:

1. **A spline side.** A smooth curve through points the person clicks, between corners like any side. It stores its **control points** (so it stays editable) and is drawn as its own curve. Constraints at first: its two end corners, and the tangent direction there (to meet a line or arc smoothly). Dimensions on its inside are left for later (`q_spline_dimensions`).
2. **Arcs only when the kernel needs them.** A spline is turned into a chain of arcs to a tolerance (a thousandth of the largest size, as the gear fit is) when an extrude, hole, offset or export needs a closed outline, and not before; the edges of the body then are arcs that can be picked and constrained as now. Trim and offset of a spline work on the same fitted chain.
3. **Ellipse**, after, as a smaller addition (angled cuts through cylinders, threads).
4. **A cam helper** (a generator in the Gear submenu's manner, `dec_gear_tool`): base radius, lift, rise, dwell and return angles, follower (knife edge, roller with its radius, flat), and a motion law (uniform, parabolic, simple harmonic, cycloidal, 3-4-5 polynomial). It writes a spline (or the fitted arcs) onto the sketch; the person then edits the points or keeps the numbers. Eccentric and snail cams need no spline and can be done first.

Ratchet wheels and pawls, Geneva drives and splines (the earlier list) are further generators of the gear tool's kind and need no new curve, so are separate entries.

**Built (`in_691`): the spline tool, first slice.** `operation/spline.ts`: a centripetal Catmull-Rom curve through the points (`splineAt`, `splinePoints`) and its arcs (`splinePieces`, each through three points of the curve, split until within `splineTolerance`, 2 parts in 10,000 of its length, 0.02 mm for a hundred). `Line.spline` keeps the points between the ends as (along the chord, out from it) in chord lengths, so a curve goes with its ends when they are moved, turned or stretched. The **Spline** tool (Sketch ring, after Curve; `tools.ts`, `pointer.ts`): each click places a point, a click on the last point again, a double click or Enter makes it (two points make nothing; a curve that returns to its start is not made yet). One place makes the arcs: `loopSteps` (`part.ts`), so the faces, the fill, the extrude sent to the kernel (`graph.ts`; the pieces are named `<line>~k`) and the flat export (`exportsketch.ts`) all see the same chain. Repeat and paste carry a spline (a mirror turns the side it bends to). **Built (`in_692`): moving the points.** A selected spline shows the points it passes through as dots (`highlight.ts`); pressing on one and dragging moves it on the spline's plane (`handles.ts` `knotAt`, `moveKnot`; the new command `setSpline`), the curve follows, the ends stay, and the whole drag is one step as a corner's is. Pressing on the curve between its points still drags the whole line. **Built (`in_693`): adding and taking away points** (`interaction/splineedit.ts`, called from `doClickSelect`): a double click on the curve of a spline puts a point there (on the curve, so its shape hardly changes, between the two points either side), and a double click on one of its points takes it away; the last point between the ends cannot be taken away (the message says to draw a line instead). **Not yet:** the tangent constraint at the ends, typing a point's place, snapping a point to a corner or line, touch, a spline cutting or being cut by the lines it crosses (`regions.ts` leaves it out), trim, offset and revolve (they refuse a spline as they do an arc where they cannot work one), a spline closed on itself, ellipse and the cam helper. Test: `spline.test.ts`.

## Rationale

A cam is defined by a motion law, not by a tooth standard, so it must be drawn as a freeform curve; a person who wants their own shape needs the same curve, and the helper becomes one more way to write it. Keeping control points keeps the curve editable; fitting arcs late keeps the kernel, picking, constraints and export unchanged (they know only lines and arcs, `inv_kernel_boundary`). The cost is that a spline's own dimensions are hard (`q_spline_dimensions`), which is why the first slice constrains only its ends and tangents.
