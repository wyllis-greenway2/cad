---
id: dec_carried_joint
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1143
date: 2026-11-19
depends_on:
  - dec_contact_push: a body held on a pin that moves is pushed by contact today; a carried joint would replace that push
  - dec_collision_to_constraints: the Fix walk cannot offer a joint for such a body until there is one
alternative_to:
---
# A coaxial constraint on a pin that moves: the body is carried round and turns on the pin

In `why_jamb` the arm's hole is held on the big gear's pin by a sketch Concentric (`r_010`) and tangents: dragging the arm honours them (it flashes), but the motion reads only mates and pivots, so the arm is pushed as a free body. The pin rides on the played gear, so the arm must be carried round by the pin and turn on it: a hinge whose axis moves. A coaxial mate made at the pin's rest position is wrong for it (the pin leaves the hole), so the Fix walk now says so and leaves it to the push.

Built (`in_1143`): read the sketch constraint as the joint (`impliedMate`), and play the arm as turning about the pin after being carried by it (the follower's `after` orbit already exists for planets), solved by contact for the turn only. That makes this motion a joint with no search.

## Rationale

Raised by the human (`in_1142`), approved to build (`in_1143`). A coaxial constraint is already the joint; what was missing is that the motion took its axis where it stands at the start, not where the pin has gone. Built in `contact.ts` (`Pushable.after`: the pose is the turn about the pin, then the carrier's own turn), `motion.ts` (`carriedBy`: the driver, or a gear it turns by a plain ratio), for a real coaxial mate and for a sketch Concentric that `impliedMate` finds. Not carried: a pin on a planet, a cam follower or a Geneva wheel; the pose cannot be kept (a drive step would be wrong); tests that want a free lever take the constraint away (`removeRelation r_010`).

## Corrected (`in_1145`)
The first build carried the body with the pin's whole turn, so the arm spun with the gear (the human's screencast), and a carried body was never tested against what it met (it is moved by the driver, so it was not in the first set of bodies looked at): it went through hard bodies. Now: the carrier gives the body only the move of the pin (`after.slip`), the turn about the pin is the body's own (the one freedom the constraint leaves, solved by contact), a carried body is tested every step, and when what it meets cannot get out of its way (a far arm on its pivot) it slips on the pin (`contact.ts`, `slipped`). This is the rule move first, turn only when nothing else clears. On `why_jamb` with the far arm hard: the far arm gives way to 16 degrees, the lever slips 19, no jam in two turns.
