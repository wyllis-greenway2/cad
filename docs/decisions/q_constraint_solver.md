---
id: q_constraint_solver
kind: question
status: open
origin: ai-unreviewed
human_input: in_001
date: 2026-11-04
---
# Which 2D constraint solver?

The blueprint (section 10) describes a custom Newton-Raphson solver. AI suggestions, not approved:
- Do **not** use SolveSpace's libslvs: it is GPLv3 and would force open-sourcing the whole app. (The AI
  suggested it earlier in the session and then corrected itself.)
- Candidates: planegcs from FreeCAD (LGPL, same packaging care as OCCT), a custom solver on a permissive
  math library such as Eigen (MPL 2.0), or Ceres Solver (BSD).
- "Circular dependencies" are not the real problem in geometric constraints (they are simultaneous
  equations); over-constrained and redundant sets are, and are found by rank analysis of the Jacobian.
