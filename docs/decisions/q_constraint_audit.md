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

- **A refusal that did not say what flashes** (`in_1101`, the user's own project): a coaxial mate between the pin of the big gear and a hole that is not the one it already stands in was refused with "that cannot be done without breaking other constraints" and a red Concentric bubble, and the user took it to mean that a mate already existed. It does not: the pin is already held in the arm's hole by a sketch constraint (Concentric, `r_010`), and the mate moves the first face selected to meet the second, which would pull the pin out of that hole. (The pair the other way round, the hole first, is made: the other body moves to the pin.) The message now says which kind of constraint holds what it would move, and that it flashes: `session.run`, `wordsOf`.

**Not looked at, so not known to be uniform** (to be audited next, each with a test of the rule): the drags of gizmos and handles (a drag preview that is held back), a typed number on a dimension that cannot take it, a gear or a cam edited against a mate, the contact pushes of an animation (a hard body that pushes another in a played motion: no one is there to press a button), the touch tools, a delete of a part a constraint needs, and the number bubbles of a locked dimension. **Hard bodies (`in_1087`, answered):** a hard body that is stopped by another flashes the body it ran into, says so and offers to delete the hardness (the constraint), like every other violated constraint: a drag is still cut short as before, and what stopped it is said when it is let go (`runop.ts`: `hardConflict`; the button deletes the hardness and makes the rest of the move; a typed number that would run in is refused with the same button). Not changed: the picture while the drag is going on (no pill to press while the pointer is held).

## Rationale

The audit is of the refusal paths in `session.run`, `runop.ts` and the suggester, which the AI read; the others are listed so that they are not taken for done.

## The third outcome: already applied (`in_1103`, built on the human's suggestion)

Besides a violated constraint (red, says so, offers to delete) and a made one, **a constraint that already holds as asked** is said ("that is already applied: ... (it flashes green)") and the one that is there flashes green (bubble and parts), and **nothing is added a second time** (asked for again, a sketch constraint used to be stacked silently). Not a refusal: no button, nothing to undo. The human proposed it as a question; **to be confirmed by the human** (it is built, not yet seen). Whether it should also apply when a constraint is only *implied* by others (true, though not made as such) is not decided.

## The swap, and a refusal that was swallowed (`in_1109`)

**Built (the human approved the AI's recommendation, `in_1109`):** a mate of two bodies moves the first face selected to the second (`in_229`); when that is refused because the first body is held where it is (a constraint, a hard body), **the mate is tried the other way round**, the second body moving to the first, and it is refused only when neither can: the message says which moved ("x_s_002 is held where it is, so x_s_083 moved to it"), or that the other way round fails too. One step, one undo. A mate with a world plane has nothing to swap. (`doRunAction` in `control/modal.ts`, `swapped`; `test/matswap.test.ts`.)

**Found on the way, a violation of the rule:** an action whose mate could not be made (hard bodies in the way, `mateCommand` gave a reason) handed over an **empty batch**, which the session kept as an **empty step in the history with not a word**. Now it hands over a refusal (`Command` type `refuse`): it is said, never kept as a step, and when hard bodies stopped it their hardness flashes and the button deletes it and makes the mate (`inv_constraint_uniformity`, `in_1084`/`in_1087`). **Other actions may do the same** (`return { type: "batch", commands: [] }` where a reason is dropped): to look for in the audit.

## A sketch's constraint that already makes a mate true (`in_1110`, `in_1111`)

**The question (`in_1110`):** a sketch circle held concentric with the pin's rim (the hole is made from that circle): is the body coaxial with the pin through it, or is a separate coaxial constraint of the bodies needed? **Answer, built (`in_1111`):** the body is coaxial through it: asked for a coaxial (or parallel axes) mate between the two round faces, the app says "that already holds: the Concentric constraint (it flashes green) makes it true" and adds nothing; the suggester does not offer what holds (`interaction/implied.ts`, `impliedMate`; the `held` command; `test/matswap.test.ts`, on the user's own project). A mate is still made on purpose for what only a mate gives (a joint that turns or slides, limits, a drive).

**The other constraints that straddle a sketch and a body or an edge** (the kinds of `rows.ts` that can name a body's edge as an anchor), what mate each stands for, and what was done:

| sketch constraint | the mate it makes true | done |
|---|---|---|
| **Concentric** (circle, circle or rim) | coaxial, parallel axes | **built** |
| **Tangent** (circle, circle or rim) | tangent (two round faces), parallel axes | **built** |
| **Tangent** (line, circle or rim) | tangent (a flat face, a round face): the wall made from the line | **built** (`test/suggestmates.test.ts`) |
| **Parallel / Perpendicular** (line, a body's straight edge) | parallel / perpendicular faces, turned only | **not built**: an edge borders two faces, so which face is meant is not known; to ask the human |
| **Coincident** (corner, a body's corner), **On circle**, **On line** (a corner on a body's edge) | none: a mate is of faces and axes, not of points | nothing to do |
| **Equal length, equal radius, same height, same across, fixed, horizontal, vertical, the dimensions** | none (a dimension fixes a number; a mate's number is on the mate; horizontal and vertical of a sketch are not the world's) | nothing to do |

**The other direction** (a mate that already holds, and a sketch constraint asked for between the same things): not implied: the sketch constraint ties the sketch to the body in the history, and the mate does not. Asked for exactly as it stands it is "already applied" (`in_1102`); that is all.

**Open:** parallel and perpendicular to a body's straight edge (above); and a **relation made to a rim that has since been named another way** keeps its circle (`relation.anchors`): the detection uses it, a relation without one cannot be checked.

## The drag channel, looked at (not yet closed)

**Read, not newly tested:** a gizmo or handle drag that is let go runs through `runOp` and so `session.run`, the one place a refusal is made; a refusal there keeps the arrow or ring where it was (`control/handles.ts`) and gets the same flash and button as any other change. `gizmo.test.ts` already holds the two cases for a sketch side held by a locked length (`in_208`, `in_665`). **Tried:** moving the bodies of the jamb project with `movePart`: they are references there, refused with "is a reference and cannot move", which names no constraint (it is not one). **Still not checked:** a body *made from a sketch* dragged while a mate or sketch constraint holds it (needs a project whose bodies are not references), the held-back preview of a drag, a typed number a dimension cannot take, gears and cams against mates, deleting a part a constraint needs, contact pushes in animations.

## A typed number, and a deleted part (`in_1167`)

**A typed number on a dimension that cannot take it: uniform, tested** (`test/typedconflict.test.ts`). A second length typed on a side that has one, and a new value for a length whose opposite side is fixed at another, are refused with "that cannot be done without breaking other constraints: ... hold what it would move"; the constraints flash and the button can delete them and go on.

**Deleting a part that a constraint needs: was silent, now built (`in_1168`).** `deletePart` / `deleteParts` take away every constraint that names the part, in the same step. The AI recommended saying which went; **the human decided otherwise (`in_1168`): no words**, but "flash red the remaining parts that relied on that constraint, and show their constraint bubble pop". **Built:** `interaction/dropped.ts` (`droppedBy`: the constraints the scene lost because a part they name is gone, and the parts of them still there); the controller starts a flash with those parts red and `popped` ids and `ghosts` (the bubbles as they were); the frame draws the ghosts while the flash lasts; `ui/bubbles.ts` tints them red and makes them swell and fade (the pop). No message, no refusal button: nothing was refused. A constraint whose parts are all gone (a length of the one side deleted) has nothing left to show, so nothing flashes for it. Test: `test/droppedbubbles.test.ts` (an equal-length constraint between two sides, one deleted). **Not covered:** parts deleted by something other than the delete action that take constraints with them (trim, a change of a step that removes a sketch's parts) flash the same way, because the detection is by the scene losing a constraint to a missing part, not by the command; that is intended.
