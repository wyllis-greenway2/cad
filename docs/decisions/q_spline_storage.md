---
id: q_spline_storage
kind: question
status: open
origin: ai-unreviewed
human_input: in_689
date: 2026-11-17
depends_on:
alternative_to:
---
# Should a spline be stored as control points, or as arcs fitted at the moment it is drawn?

`dec_spline_and_cams` proposes control points, fitted to arcs only when the kernel needs them. Control points keep the curve editable and the file small, but the fit runs each time and a spline has no constraints inside it beyond its ends and tangents. The other way (fit arcs when drawn, store the arcs) reuses the constraint, trim, offset, hole and mesh code as it is, at the cost of an arc chain that is awkward to reshape. Also open: how a spline gets dimensions and constraints along its length. Not decided; the human has not answered.

## Rationale

The answer decides what the file holds and what the constraint solver must understand, so it should be settled before code.
