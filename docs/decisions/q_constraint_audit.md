---
id: q_constraint_audit
kind: question
status: open
origin: ai-unreviewed
human_input: in_1086
date: 2026-11-19
depends_on:
  - inv_constraint_uniformity: the audit is of what that rule says
alternative_to:
---
# The audit of constraints: what was found, what was fixed, what has not been looked at

**Found by reading the code (`in_1086`), and fixed:**
- **The suggester offered nothing for a body's faces and edges** (`constraintsFor` accepted only drawn corners, lines and circles; the ring menu, which asks the same `actionsFor`, offered the mates). A pin's wall with a hole's wall gets Mate: coaxial, parallel axes, perpendicular axes and tangent; two flat faces get flush, parallel and perpendicular; one face gets Horizontal and Vertical (mates with the world). Mates with a number (angles) are not offered (the number is on the bubble); one that already holds is not offered again. **A single face now has suggestions where it had none** (the old test that a face alone offers nothing is for Select similar only).
- **Refusals that flashed but offered no deletion**, in four places: a step the kernel could not make with constraints holding the part (`failed` in `session.run`: the constraints flashed, victims empty), a constraint to an edge of the body that was lost (victims empty), mates that cannot all hold and mates that are no longer true after a change that stays (message only: no flash, no button), and the notice itself, which showed the button only when there was a change to go on with. Now all name their constraints as `victims`; the notice has the button with or without a change ("Delete constraint" alone deletes only the constraint).
- **Refusals that named no constraint at all** (`runop.ts`): "that size is not possible ... a locked size or angle holds them" (a tangent arc's radius) and "the constraints on the sketch would put it back" now name the constraints that hold the part.

**Not looked at, so not known to be uniform** (to be audited next, each with a test of the rule): the drags of gizmos and handles (a drag preview that is held back), a typed number on a dimension that cannot take it, a gear or a cam edited against a mate, the contact pushes of an animation (a hard body that pushes another in a played motion: no one is there to press a button), the touch tools, a delete of a part a constraint needs, and the number bubbles of a locked dimension. **Hard bodies (`in_1087`, answered):** a hard body that is stopped by another flashes the body it ran into, says so and offers to delete the hardness (the constraint), like every other violated constraint: a drag is still cut short as before, and what stopped it is said when it is let go (`runop.ts`: `hardConflict`; the button deletes the hardness and makes the rest of the move; a typed number that would run in is refused with the same button). Not changed: the picture while the drag is going on (no pill to press while the pointer is held).

## Rationale

The audit is of the refusal paths in `session.run`, `runop.ts` and the suggester, which the AI read; the others are listed so that they are not taken for done.
