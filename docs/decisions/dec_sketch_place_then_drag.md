---
id: dec_sketch_place_then_drag
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_123
date: 2026-11-05
depends_on:
  - dec_interaction_spec: this changes the drawing tools it describes (the second click that finished a figure)
---
# Sketching: a click places the figure, its other points are dragged to size it

The human asked (`in_123`) to try this. A pencil bubble is offered on a selected plane or face; it offers the shapes (line, rectangle, circle); the first click on the plane puts the origin point and makes the figure at once at a small default size; a ball sits on each other defining point (the opposite corner, a point on the circle, the end of the line) and dragging it sets the size. The keys R C L and the menu start the same thing. A click away from the ball, Enter or Esc ends it, and the figure stays selected. My details, not yet approved: the default size, one segment per line (no chain), typed sizes are not used while the ball is up, and the pencil shows for a single plane or face (including the one chosen with the X Y Z buttons).

## Rationale

The point of the change is that a figure exists the moment you click and sizing is a drag, the same gesture as the helper handles, instead of a second click far from the first. Provisional until the human has tried it.
