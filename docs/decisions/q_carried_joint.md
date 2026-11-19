---
id: q_carried_joint
kind: question
status: open
origin: ai-unreviewed
human_input: in_1135
date: 2026-11-19
depends_on:
  - dec_contact_push: a body held on a pin that moves is pushed by contact today; a carried joint would replace that push
  - dec_collision_to_constraints: the Fix walk cannot offer a joint for such a body until there is one
alternative_to:
---
# A joint whose axis is carried by a moving pin (and read from sketch constraints)

In `why_jamb` the arm's hole is held on the big gear's pin by a sketch Concentric (`r_010`) and tangents: dragging the arm honours them (it flashes), but the motion reads only mates and pivots, so the arm is pushed as a free body. The pin rides on the played gear, so the arm must be carried round by the pin and turn on it: a hinge whose axis moves. A coaxial mate made at the pin's rest position is wrong for it (the pin leaves the hole), so the Fix walk now says so and leaves it to the push.

Proposed (not built): read the sketch constraint as the joint (`impliedMate`), and play the arm as turning about the pin after being carried by it (the follower's `after` orbit already exists for planets), solved by contact for the turn only. That makes this motion a joint with no search.

## Rationale

Raised by the human (`in_1135`); open until they say to build it.
