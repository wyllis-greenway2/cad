---
id: q_spline_dimensions
kind: question
status: open
origin: ai-unreviewed
human_input: in_738
date: 2026-11-17
depends_on:
alternative_to:
---
# How does a spline get dimensions and constraints along its length?

`dec_spline_and_cams` keeps a spline's control points and constrains only its end corners and the tangent direction there. Open: whether a person can dimension or constrain a point along the curve (a point on the curve at a given distance, a control point fixed to a corner, the curve's length, symmetry about a line), and how the solver would treat the curve (as its control points, or as the fitted arcs). Not decided; the human has not answered. Not needed for the first slice.

## Rationale

It decides how far a drawn cam can be controlled by numbers, and what the constraint solver must understand, so it is settled before more than the ends are constrained.
