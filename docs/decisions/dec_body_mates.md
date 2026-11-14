---
id: dec_body_mates
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_306, in_307, in_314, in_315, in_316, in_317, in_318
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

**A gap that can be typed, and parallel mates (`in_317`).** *Flush* has a number, the gap the faces are left at (mm, 0 or more; positive is apart, along the other face's outward normal): with two faces selected a number stands over them showing how far apart the first face is from the other's plane now, and typing one makes the mate with that gap (the menu's "Mate: flush faces" is a gap of 0); it is recorded and checked at that gap, and made again between the same two bodies it replaces the mate there (one record, `existingMate`). Two new mates **only turn** the first body and leave it where it is (a point of the face or the axis stays put): **Mate: parallel faces** (flat faces: the normals made parallel, the nearer way round, either facing) and **Mate: parallel axes** (round faces: the axes made parallel). They are checked by the angle left (degrees) and, being about a turn, find their faces again within forty-five degrees. A mate that needs no motion (the faces meet already) is only recorded.

**Perpendicular and angle mates (`in_318`).** Four more mates that only turn the first body (it stays where it is): **perpendicular** (faces, and axes of round faces) turns it until it is at a right angle to the other, and **angle between faces / between axes** turns it until it is at the **typed angle** (degrees, 0 to 90, kept in the record's `gap`; 0 is parallel, 90 perpendicular). The angle is the one between the two **as lines** (the planes of the faces, or the axes): the turn is the smaller one, about the line across both, toward the other when the angle is to be less and away when more (`turnToAngle`); a face has no "right way round" for these. Checked by the angle off (degrees) and found again within forty-five degrees. Two selected faces show **both numbers** over them, the gap and the angle (`mateMeasures` in `annotations.ts`; `Annotation.measureId` says which action a typed value is for), each typed number makes that mate (the intent `relation measure` carries the action's id).

**Marked on the model (`in_316`).** Each mate has a small round mark on the model where the two bodies meet (the middle of the first face, `Frame.mates`; `ui/matemarks.ts`): **teal with a link** when it is true, **amber with a bang** when it is not (its title says how far off, and a click puts that mate back: `mate:reapply:<id>`), **grey with a query** when a body or a face is gone. A click on any other mark selects the mate's two bodies (`mate:select:<id>`). The title is also what a held press shows on a phone.

**Found and fixed on the way (browser check):** a saved file with a relation to a part of the body could not be opened in the browser: the replay runs before the kernel's thread has answered, so the body is not there to be named, and `addRelation` refused it. A relation may now name a part of the body (`b/...`) that is not there yet, and the description of such a relation (the anchors, the mate's numbers) is put into the command when it is made (`describedCommand`, `session.run`), so the file carries it and the replay needs no geometry. This also holds for the relations to edges, corners and faces of `dec_anchor_geometry`, which would not have opened in the browser either.

Not a standing constraint (bodies do not follow their mates by themselves): that is the open `q_mate_persistence` (option 3). Not built: a flush that also lines up an edge, a distance for a parallel mate, a gap for a coaxial one, an angle of more than 90 degrees (a face that must face the other way round), the angle between a flat face and an axis, pivots and slides (the mates that leave freedom), a body that is fixed in place, snapping suggestions while a body is dragged.

## Rationale

A placement mate needs no new subsystem: the kernel already moves and turns one body of several, the sketches follow, and the history already replays. It gives the assembly user the most used action (put this face on that face, this pin in that hole) at once, and its steps are the ones a standing mate would later keep correcting, so nothing built here is thrown away.
