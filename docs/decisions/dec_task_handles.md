---
id: dec_task_handles
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1604
date: 2026-11-26
depends_on:
  - dec_three_surfaces: a handle is another way to reach a task of the registry, so what a task is (say, update, commit, cancel) must stay the one lifecycle
alternative_to:
---
# Tasks, and handles to reach them in the scene

Every tool and operation is a task (`next/src/tasks.ts`), reached from the circle menu. A task may also offer **handles**: controls in the scene (on a face, a corner, an edge, a sketch part) that reach the same task and the same draft by direct manipulation. A handle is not always an arrow and not always a pull: its form (arrow, dot, ring, arc, a click target) and its gesture (drag along an axis, turn, click, drag in a plane) belong to the handle, and what it changes belongs to the task. Examples to build toward: the arrow on a face to extrude a sketch or pull a face (as in the old prototype); the corner arrow that chamfers one way and rounds the other; the mover that orients a sketch plane.

How it works (proposed, not yet approved in detail):
- A handle is data a task returns: where it sits, what it looks like, which gesture it takes, and a function from the gesture to a change of the task's draft. It draws nothing and reads no input.
- One drawer and one input path serve every handle; a task never draws its own.
- A handle changes the same draft the info bar shows: a dragged number appears live in the pill, a typed number moves the handle. One value, several ways to set it.
- A handle may set more than a number (the corner arrow's sign picks chamfer or round): the task owns that rule.
- Commit and cancel are unchanged: right click makes what is valid, Esc throws the draft away.
- Handles are never the only way: every task is also reachable from the menu.
- Whether a handle is a "fourth surface" next to the menu, notices and info bar: proposed that it is not (it is a control of a task's draft in the model's own view); the human has not said.

## Rationale

The human wants one system for tools and operations, with the direct handles of the old prototype kept as a way into it (`in_1604`). Making handles data of the task keeps new features (revolve, loft, gears) to a registry entry plus a task, without their own UI code.
