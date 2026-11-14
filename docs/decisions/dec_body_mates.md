---
id: dec_body_mates
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_306, in_307, in_314, in_315
date: 2026-11-14
depends_on:
  - dec_independent_bodies: the bodies that are mated are the independent bodies of one model, each named by the step that made it
  - dec_modifications_are_steps: a mate is made of the same move and turn steps as any other change to a body, so it undoes, saves and replays
  - prin_history_additive: the mate adds steps; nothing is rewritten
  - dec_anchor_geometry: the faces to mate are the body's faces, found as the anchors are
alternative_to:
---
# Mates: two faces of two bodies brought together

The human approved (`in_314`, after `in_306` and `in_307`: an assembly is just a model whose bodies are in relationships) starting on constraints between bodies. This is the first slice, a **placement mate**: select a face of one body, then a face of another; the first one's body is **moved and turned** to meet the second (the one selected first moves, as with sketch constraints, `in_229`).

- **Mate: flush faces** (two flat faces): the first face is turned to face the other (its normal opposite) by the shortest turn, and moved along the other's normal until the planes meet; it slides freely in the plane (nothing about where along the face is decided).
- **Mate: coaxial** (two round faces, a post or a hole): the first axis is turned parallel to the other's (the nearer way) and moved across onto it; its place along the axis is kept.
- Offered in the menu for the two faces (`actions.ts`), refused with the reason for faces of one body or the wrong kinds (`mate.ts` `whyNotMate`).
- The motion is worked out in `mate.ts` from where the faces are now and written as **ordinary steps**: a turn about X, one about Y, one about Z (the angles that make the turn, about a point on the face or the axis), then a move by a vector, each naming the body, with the body's own sketches carried by the same motion (`carrySketches`, as for any move of a body). So a mate undoes in one undo, saves, opens and replays like any other, with no new kernel operation.

**Checked, and put back on request (`in_315`, option 2 of the former `q_mate_persistence`).** Each mate is also **recorded** as a relation of kind `mate` (`operation/mates.ts`): it names the two bodies and keeps, in numbers, how each face stands when the mate is true (its direction, a point on it, a round face's radius) and the gap. The faces are found again by those, as anchors are: the face of that body with the same way round, nearest to the remembered one (within eight degrees and 10 mm; else the mate is *lost*). After every change `mateStatus` says whether each mate is **ok** (the faces touch or share an axis within a thousandth of a millimetre), **off** (found, but apart or turned) or **lost** (a body or a face is gone). A change that newly breaks a mate says so in the message (the change stays), and the **⋯ menu** has "Put the mates back" while any is off: it makes each one again from where the faces are now, as new turns and moves, one at a time (a body moved by one mate may be what the next rests on), and records it again with the same id. A mate of a body that is deleted goes with it. It is **not automatic**: nothing moves unless the user asks.

Not a standing constraint (bodies do not follow their mates by themselves): that is the open `q_mate_persistence` (option 3). Not built: an offset (a gap) typed in, a flush that also lines up an edge, parallel / perpendicular / distance between faces, pivots and slides (the mates that leave freedom), a body that is fixed in place, snapping suggestions while a body is dragged.

## Rationale

A placement mate needs no new subsystem: the kernel already moves and turns one body of several, the sketches follow, and the history already replays. It gives the assembly user the most used action (put this face on that face, this pin in that hole) at once, and its steps are the ones a standing mate would later keep correcting, so nothing built here is thrown away.
