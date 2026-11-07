---
id: q_body_edges_as_sketch
kind: question
status: open
origin: ai-unreviewed
human_input: in_207
date: 2026-11-07
depends_on:
  - dec_sketch_follows_body: the sketch already follows the body; this asks how far it should behave like a normal sketch on the body
---
# Should the edges of a body show and take what a sketch shows (radius, centre, tangent / coincident), and allow more sketching on it?

in_207 wants the sketch to feel fully part of the body and still be a regular sketch: selecting a curved edge on the body should show its radius value, its centre point and the constraints it carries (tangent, coincident), and sketching should continue as long as no constraint is violated. Today the body's edges are measured from the kernel (they have a circle's size but no centre part and no constraints); the real sketch parts are hidden behind the step that used them.
Options: (a) selecting a body edge that came from a sketch part selects / shows that part's info (radius, centre, constraints) through the hidden sketch; (b) bring the sketch back as editable on the body (History "sketch" button), then (a). Not decided; waiting for the human.

## Rationale

Needs the human's choice before building: it touches what a click on the body means (body edge vs the sketch part behind it) and `dec_sketch_belongs_to_step`.
