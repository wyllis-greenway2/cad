---
id: q_sketch_planes
kind: question
status: open
origin: ai-unreviewed
human_input: in_383
date: 2026-11-15
depends_on:
alternative_to:
---
# Sketch planes you insert, and the plane a sketch on a curve gets

`in_383` asks for a sketch plane that can be inserted: semi-transparent, not looking like a body, placed where you want in space, then looked at straight on (orthographic) to sketch on it; and that sketching on a curve adds one of these by default, normal to the curve's average, "or how else would you suggest" orienting it. **Nothing is built; this is the AI's proposal for the human to correct.**

**Proposal.** (1) *Insert:* a "Sketch plane" entry in the Sketch category puts a plane at the view's target, facing the camera (snapped to the nearest world axis when within a few degrees, else free), selected, with the usual Move and Rotate handles (a plane has no sketch on it yet, so these need to work on a plane alone, which they do not yet). Drawn as a faint tinted pane with a dashed outline and no shading, so it cannot be taken for a body or a world plane; it is a part like the planes drawn on faces, so what is sketched on it follows it when it is moved. (2) *Sketching on a curve:* an edge that lies in a plane (a circle, an arc, a planar curve) gets the plane it lies in, which is the exact answer and not an average. A curve that is not flat gets, by default, the plane through its end points that contains the view direction's nearest perpendicular, i.e. a plane that stands *normal to the curve at its middle* (normal = the tangent at the middle) so the sketch can profile the curve's cross-section; a second choice, the best-fit plane of the curve (least squares), is offered where the curve is nearly flat. A straight edge: normal to the edge at its middle. In every case the plane is inserted as in (1) and can then be moved.

**Open for the human:** whether "normal to the curve" (a cross-section plane, good for sweeping a profile along it) or "the plane the curve lies in" (good for drawing beside it) is the default for a flat curve; whether the plane is a new kind of part or the same as the planes drawn on faces; how it is drawn.

## Rationale

Needed once anything depends on this entry; recorded now because production code for it needs an accepted entry (`CLAUDE.md` rule 9).
