---
id: dec_body_look_and_feel
kind: decision
status: accepted
origin: human
human_input: in_1704
date: 2026-11-28
depends_on:
  - dec_view_looks: its looks (solid, see-through, the cut, a mark laid over) are the base; this entry says there are only two body renderings for now, and how the marks are drawn
  - dec_task_handles: the pull arrow stays the one handle for a face and for edges; this entry says where it stands and how it points
alternative_to:
---
# A body looks and is handled as in the old prototype, from fewer, reusable parts

The human decided (`in_1704`): copy the old prototype's look and feel, with cleaner and leaner code made of reusable parts.

1. **The lines and vertices of a 3D body are drawn with the sketch's own visuals** (the same strokes and dots), not by a drawing of their own.
2. **Two renderings of a body for now:** solid grey and wireframe, each as in the old prototype. **Wireframe is reached from a View section of the circle menu**, as in the old prototype.
3. **The arrows work as in the old prototype:** the edge's arrow stands angled out of the body at the edge, and the face pull's arrow stands in the centre of the face.
4. **Selecting a body or a face looks as in the old prototype:** the same highlight colour, and the same spread of the colour as a circle growing from the click.

Notes. The old app's highlight colour is the teal `#1ab8b3` (`settings.orb.color`, "THE teal"); the human called it blue; it is copied as it is. In the old app the wireframe item is in the ⋯ list under View (`in_1387`); the human asked for the circle menu, and that is what is built. This entry does not decide how a pull is previewed while dragging; the decisions on that stay as they are.

## Rationale

The human wants the old look and feel kept, and the code lean: one set of strokes and dots for every line a person sees, two body renderings instead of one per feature, and an arrow and a selection effect that every operation reuses. The old app made a new look, colour or mesh for each new operation; here an operation reuses these.
