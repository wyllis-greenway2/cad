---
id: dec_sketch_on_face_follows_body
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_233, in_234
date: 2026-11-08
depends_on:
  - dec_sketch_follows_body: this widens it (not only the sketches an extrude used are carried when the whole body is moved, turned or scaled)
---
# A sketch drawn on a face of the body belongs to the body and goes with it

The human, `in_233`: "I feel like sketches on faces should belong to the faces and move with them, what do you think?"; approved as recommended in `in_234` ("Yes please build it that way").

1. A plane made from a face of the body (`planeForDrawing`, when something is drawn on a face: a sketch tool, or the offset of the face's edges) says so: `onBody`. The new plane a carried sketch gets keeps it.
2. A move, a turn or a scale of the whole body carries every sketch drawn on such a plane, with the sketches that made the body, in the same command (`transformFigure`, one undo). While the body is dragged the picture of those sketches is moved by the same numbers as the body (no kernel).
3. A free drawing that merely lies where a face is (for example on the XY plane under a body whose bottom face is there) has no link and stays where it is.
4. Not in this version: a face that is pushed or pulled (a sketch on it does not follow the face), a face the body later loses (its sketch stays as it is, a free drawing). Files made before this have no link on their planes: a sketch drawn on a face before stays where it is and has to be drawn again.
5. Constraints tied to something outside the body keep holding the sketch (`in_205`), as for the extruded ones.

## Rationale

The same reasoning as `dec_sketch_follows_body` (a sketch must not be left where its body used to be), for what is drawn on the body afterwards. The link is recorded when the sketch is drawn, not found by position, so a free sketch that happens to be coplanar with a face is never dragged along.
