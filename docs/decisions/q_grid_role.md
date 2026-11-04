---
id: q_grid_role
kind: question
status: open
origin: ai-unreviewed
human_input: in_001
date: 2026-11-04
---
# Is the grid a storage rule or a UI feature?

The human's blueprint (section 7) snaps control points to a 0.01 mm grid, keeps curves exact between
them, and snaps boolean intersection endpoints to the grid. The AI raised these concerns: snapped
endpoints no longer lie exactly on both surfaces, which can break watertightness; angled geometry,
revolves and patterns produce off-grid points; mesh cracks are avoided by sharing tessellated edges, not
by a grid; 0.01 is not exactly representable in binary floats (integer microns would be).

AI suggestion, not approved: keep the grid for snapping, typed-value rounding and display, but not as a
storage invariant for geometry. Until the human decides, the blueprint's position stands as the human's
stated intent.
