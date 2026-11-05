---
id: dec_sketch_lines_and_constraints
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_054
date: 2026-11-05
depends_on:
  - dec_constraint_solver_small: the shapes are made of lines whose rules are constraints the solver holds
---
# Sketches are corners and lines; a rectangle is a shortcut for four lines and their constraints

The human suggested simplifying sketches to vertices and lines, with some sets locked by constraints, and shapes such as a rectangle as shortcuts for sets of lines with constraints they could have made themselves, and
that a thing's constraints show only while it is selected (`in_054`, tentatively: "I am not sure"). The AI built it, so it stays provisional until the human confirms:
- The rectangle tool now makes a closed polyline of four corners with real horizontal and vertical constraints. They can be turned off (the rectangle can then shear into a parallelogram) and others added.
  Circles stay circles. (A legacy `rect` shape with built-in rules still loads, in tests only.)
- A constraint that is already true (a rectangle's right angle, implied by its horizontal and vertical lines) can be added to lock it. Asking for a constraint that is on turns it off (the button shows as on).
  Only a constraint that contradicts the shape or others, or would collapse or fold the geometry, is refused, and the reason is shown.
- Constraint marks show only for the picked line, corner or circle (or for the whole shape when the whole shape is selected).
- A rectangle's four length dimensions are now four line lengths (there is no separate W and H).

## Rationale

Built-in invisible rules made a rectangle impossible to adjust or to lock explicitly (the human could not set a line horizontal or lock its right angle). Making the rules ordinary constraints makes them visible,
removable and the same mechanism as everything else, and keeps one representation of a sketch (corners and lines).
