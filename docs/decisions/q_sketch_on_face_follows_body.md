---
id: q_sketch_on_face_follows_body
kind: question
status: open
origin: ai-unreviewed
human_input: in_233
date: 2026-11-08
depends_on:
  - dec_sketch_follows_body: this would widen it (today only the sketches an extrude used are carried when the body is moved, turned or scaled)
---
# Should a sketch drawn on a face of the body belong to that face and move with the body?

The human, `in_233`: an inset drawn on the bottom face does not move when the body is turned; "I feel like sketches on faces should belong to the faces and move with them, what do you think?"

Today: a sketch on a face of the body is drawn on a plane of its own (`planeForDrawing`: a drawn plane with the face's place and directions, in world numbers, linked to nothing). Moving or turning the whole body carries only the sketches an extrude used (`dec_sketch_follows_body`), so the inset stays where the face was.

Recommendation (not decided): **yes**, with the link made when the sketch is drawn, not found by chance afterwards.
1. A plane made from a face of the body records that it belongs to that body (`on: body`). The sketches on it are then carried with every move, turn and scale of the whole body, as the extruded ones are (the same `transformFigure`, one command, one undo).
2. A free drawing that merely lies in the same place (for example on the XY plane under a body whose bottom face is there) stays where it is: it has no link.
3. Not in the first version: a face that is pushed or pulled (the sketch on it would have to move with the face), or a face the body later loses (the sketch is left as a free drawing).
4. Constraints tied to something outside the body (`in_205`) keep holding the sketch, as they do for the extruded ones.

## Rationale

It is the same reasoning as `dec_sketch_follows_body` (a sketch must not be left where its body used to be) applied to what the human draws on the body afterwards, and it is what a face with a drawing on it looks like in the real world. The risk of the alternative (carry whatever lies on a face by position) is that a free sketch on a world plane would be dragged along whenever a body face happens to be coplanar with it, so the link is recorded.
