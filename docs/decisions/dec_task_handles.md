---
id: dec_task_handles
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1604, in_1605, in_1606
date: 2026-11-26
depends_on:
  - dec_three_surfaces: a handle is another way to reach a task of the registry, so what a task is (say, update, commit, cancel) must stay the one lifecycle, and the numbers a handle sets are info-bar numbers
alternative_to:
---
# Tasks, and three handles to reach them in the model

Every tool and operation is a task (`next/src/tasks.ts`), reached from the circle menu. A task may also be reached by a **handle**: a control in the model's own view. There are exactly three, each a gesture class, so handles do not multiply (`in_1605`):

1. **The mover orb:** always the one orb (with or without the extra pull arrows). For any input that is movement or rotation (a body moved or turned, a plane oriented, a revolve's angle).
2. **The pull arrow:** a drag along one axis giving a signed number. Its anchor says what it means: on a **face** (or a closed sketch region) it is push or pull (extrude); on an **edge** it is chamfer one way and round (fillet) the other. The kinds of a face pull (move face, extend, offset) are offered on the right of the info bar and switch the draft's kind; the arrow does not change.
3. **Grab:** pressing the object itself and dragging: free movement. (A sketch part: the solver drag that exists; a body: free move. To be defined further; it needs a rule for a press on an object against a press on empty space.)

A new handle is allowed only for a new gesture class, and then it is specified here first, generic and reusable. A new feature (revolve, loft, gears) chooses among the three, says where it is anchored and what the value means, and puts its numbers on the info bar.

How it works:
- A handle is data a task returns (which of the three, its anchor, and what the value means). One drawer and one input path serve all; a task never draws its own.
- A handle changes the same draft the info bar shows: a dragged number appears live in the pill, a typed one moves the arrow.
- Commit and cancel are unchanged: right click makes what is valid, Esc throws the draft away.
- A handle is never the only way: every task is also reachable from the menu.
- **A handle is not a fourth surface.** A surface is the app talking in screen space (menu, notices, info bar). A handle lives in the model's space: anchored to geometry, moving with the camera, like the selection highlight. A control drawn in screen space would be a surface, not a handle.

Built: the pull arrow (`next/src/operationcontrol.ts`, one arrow for every operation): `Operation.pulled` and `withPull(d)` make a drag set more than a number; on an edge (round, chamfer) the arrow stands on the middle of the first edge and points out of the body between its two faces, pulled out it is a round, pushed in a chamfer, and the two kinds are also chips on the info bar. The face and edge tools open their operation from their task (`tasks.ts` calls `bodyOps.operationFor` in `bodyops.ts`; `doOnPick` is gone); trim is a drawing task and the sketch plane a one-shot task, both already. Not yet: the mover orb and grab through the same task data. The pull is by the pointer's movement along the arrow as it looks on the screen (`pullDelta` in `orb.ts`), the arrow's look never counted shorter than `settings.pull.minGain` (half) of the longest it could look, so an arrow pointing nearly at the camera is no longer a huge pull; the mover's own axes still use the ray method.

Status: the definition is approved in general (`in_1604`–`in_1606`); the entry stays provisional until the first handle is built and seen.

## Rationale

The human wants one system for tools and operations, with the direct handles of the old prototype kept as a way into it, and no explosion of handle variants (`in_1604`, `in_1605`). Three gesture classes cover moving, pulling along an axis and direct dragging; everything else is a number on the info bar.
