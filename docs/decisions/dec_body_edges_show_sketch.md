---
id: dec_body_edges_show_sketch
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_210
date: 2026-11-07
depends_on:
  - dec_sketch_follows_body: the sketch already follows the body; this asks how far it should behave like a normal sketch on the body
---
# Should the edges of a body show and take what a sketch shows (radius, centre, tangent / coincident), and allow more sketching on it?

in_207 wants the sketch to feel fully part of the body and still be a regular sketch: selecting a curved edge on the body should show its radius value, its centre point and the constraints it carries (tangent, coincident), and sketching should continue as long as no constraint is violated. Today the body's edges are measured from the kernel (they have a circle's size but no centre part and no constraints); the real sketch parts are hidden behind the step that used them.
Options: (a) selecting a body edge that came from a sketch part selects / shows that part's info (radius, centre, constraints) through the hidden sketch; (b) bring the sketch back as editable on the body (History "sketch" button), then (a). Option (a) approved in in_209 and built: a body edge that lies where a sketch part was (found by position, `operation/edgesource.ts`) shows that part's constraints, its radius, and its middle; its numbers sit on the edge. Option (b) approved in in_210 and built as far as it goes (`actions.ts`): a body edge that lies on a sketch part *is* that part for every action and constraint (radius, length, tangent, equal, concentric...), the number on it can be typed over, and a change the steps made from the sketch cannot take (or that constraints hold) is refused with the holding constraints flashing, never a prism. A sketch tool started with such an edge selected draws in the sketch's own plane, so new parts can be tied to the body's sketch by constraints (select the new part and the body edge). While such a tool is on (`in_211`) the hidden sketch of that plane is drawn, picked and snapped to like any sketch (`Scene.reveal`, `consumed`; `Session.reveal` set by the controller from `Tool.reveal`), so its middle points can be picked and new parts can be joined to it; it is hidden again when the tool is put away. **Not built:** a new drawing is a separate sketch (it is not added to the old extrusion's profile); the middle-point dot on the body edge itself is not pickable (only when the sketch is shown).

## Rationale

Needs the human's choice before building: it touches what a click on the body means (body edge vs the sketch part behind it) and `dec_sketch_belongs_to_step`.
