---
id: dec_polygon_tool
kind: decision
status: accepted
origin: human
human_input: in_1267
date: 2026-11-20
depends_on:
  - dec_sketch_lines_and_constraints: the polygon is lines with the same joins and constraints as any drawn figure, so it can be edited like one
alternative_to:
---
# A polygon sketch tool

A sketch tool, with the others (rectangle, circle, line, curve, spline), that **asks for the number of edges** and draws a regular polygon from that. Chosen from the Sketch ring as **Polygon**. The number of edges is a field of the tool, shown as soon as the tool is armed (6 until another is typed; at least 3, at most 64); a click on a surface places the middle, the pointer then sets the size (the distance to a corner) and turns the polygon (a corner follows the pointer); a second click makes it. Sizes can be typed: Diameter (corner to corner) and Edges, Tab goes between them.

What is made: the lines of a closed loop sharing their corners (as a rectangle's are), with every side made equal in length (equal-length relations) so that dragging a corner keeps the sides alike; the face of the loop is selected afterwards, to be extruded. A middle placed on a corner or circle centre is joined to it, as a circle's is.

## Rationale

Asked for by the human (`in_1267`): "it should just ask you the number of edges and draws a polygon based off that". The equal sides are the one constraint that is true of any regular polygon and cheap to keep; the angles are left free (a regular polygon's angles are fixed by the number of sides and equal sides on a circle, which would need a circle part drawn with it).
