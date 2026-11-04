---
id: dec_constraint_solver_small
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_045
date: 2026-11-04
---
# A small constraint solver of our own, kept replaceable

The human chose option 2 of the former `q_constraint_solver`: write a **small 2D constraint solver of our own**, starting with a short list of constraint types and growing it
(`in_045`, on the AI's recommendation to build it unpluggable, as for the kernel in `dec_kernel_hybrid`).

Shape of it (not built yet):
- A pure module (`inv_math_pure`), no UI and no kernel: `solve(sketch points and sizes, constraints)` returns the solved numbers and a status: solved, under-constrained
  (free directions remain), over-constrained or redundant (with the offending constraints named).
- First constraints: fixed point, coincident, horizontal, vertical, equal length or radius, fixed distance or radius (a dimension), parallel, perpendicular.
- Method: Newton-style iteration on the constraint equations, with a rank check of the Jacobian to detect over-constrained and redundant sets. No third-party solver is used, so
  there is no licence question (libslvs is GPL and is excluded; planegcs would add LGPL packaging).
- The interface (constraints in, solved sketch and status out) is the only thing the rest of the app sees, so a larger solver can replace it later without touching the UI.

**Built (`in_051`)** in `prototypes/cad-ui/src/solver/solver.mjs` (pure; Levenberg-Marquardt with a numeric Jacobian, rank check for degrees of freedom and redundant constraints, leave-one-out search for the constraints in a
conflict) and `src/sketchsolve.mjs` (maps rectangles, circles and polylines to it; a rectangle carries built-in horizontal and vertical constraints). Constraints so far: fixed point, coincident, horizontal, vertical,
distance, horizontal and vertical distance, equal length, equal radius, radius, parallel, perpendicular. Not yet: angle, tangent, point on line, midpoint, symmetric, arcs. The interface is `solve(system, constraints)`
and `solveSketch(shapes, constraints, soft)`; nothing else knows how it works.

## Rationale

A solver we write ourselves has no licence cost, is predictable, and is enough for the sketches in the blueprint's first phases. A small, well-defined interface keeps the
option to grow it or swap it, the same reasoning as the kernel boundary.
