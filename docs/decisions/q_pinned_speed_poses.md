---
id: q_pinned_speed_poses
kind: question
status: open
origin: ai-unreviewed
human_input: in_1525, in_1526, in_1527
date: 2026-11-22
depends_on:
  - dec_body_placement: the poses are the answer of the `place` step; a change to how a placement is solved changes what is worth returning
---
# Pinned for the speed and rendering session: poses only, for animation and drags

**Pinned, not built (`in_1527`: the human plans a session on speed and rendering and wants this there).** When a mated body is dragged or a named number is swept (an animation is the same thing as a drag, `in_1525`), each step of it need not send a new mesh. The worker could answer a list of values with **only the pose of each body that moved** (a turn about a point and a move, which `place` already computes), and the screen would move the meshes it already has by those poses, remeshing only when the person stops. This is a speed matter and no part of the model (`in_1526`): the recipe never holds a path. To decide in that session: whether it is needed at all (measure a full recompute and mesh of a real assembly first); what the screen does for a body whose faces change shape during the sweep (a pose is not enough: remesh those); and how many frames a second the solve itself allows (the placement solve of two bodies took 3 to 18 iterations in the checks).

**Also pinned (`in_1529`): solid body contact.** Collision is the same range modifier on the signed distance between two bodies, one-sided, from zero up (`in_1528`); the constraint is no cost, the distance query is. To decide later, with the speed work: rough bounding checks so only near pairs are queried; a cheap interference report first (the overlap by a boolean common) before contact is a constraint; contacts active only when near (the nearest feature pair switches, which makes the measured distance change direction suddenly); and how to get a body back out of an overlap (a distance does not say how deep).

**Also pinned (`in_1530`): where a chain's time goes.** 60 holes one after another in a 400 x 400 x 10 block took 30 s (about 0.5 s a step, growing with the faces), of which the validity checks were 2 to 5 percent. The time is in the steps (the cut, the face join, carrying every face's id, the sliver check that reads every face): to profile first in the speed session, before any policy of skipping checks.

## Rationale

Kept as a question so it is not lost and not mistaken for a decision: nothing depends on it, and the human wants it handled with the rest of the speed work.
