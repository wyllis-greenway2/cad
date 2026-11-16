---
id: dec_history_navigation
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_563, in_564, in_572
date: 2026-11-16
depends_on:
  - prin_history_additive: the history is a list of commands with a cursor; moving to an earlier point only moves the cursor, nothing is removed
  - dec_modifications_are_steps: a change of a step's numbers is a command (`setStepParams`) added at the end; it does not rewrite the list
  - dec_hidden_bodies: the first item of the order of `in_563`, built before this one; it is the same panel and the same kind of row
---
# The History panel: go to any step, and change the numbers of a step

**What the human asked (`in_563`, `in_572`):** the history is not usable; it should be possible to move to different spots in the history and to click an operation in it and modify it. The second item of the agreed order (`in_563`, `in_564`).

**What is built, and the choices that were mine**
1. **The list shows every step, the ones after the cursor too.** The History panel lists the steps of the model as it is at the cursor and then the steps that come after it (the ones that undo has put away and redo would bring back), those after the cursor faded. The step where the cursor is is marked.
2. **Go to a step.** Choosing a step's row moves the cursor to the point just after the step was made: the model is shown as it was then (its bodies, its sketches, what was selectable). This is the cursor of undo and redo, jumped: nothing is removed, the later steps stay faded in the list and can be gone back to (any row, or redo). It is **not** a rollback bar that shows the model with later steps suppressed and the later numbers kept: it shows the model as it was made, with the numbers as they were at that point.
3. **Doing something at an earlier point drops what comes after it, as after an undo** (`prin_history_additive`, the rule that was there before): the faded steps go. The panel says so while the cursor is not at the end. Making a new step in the middle of the history (inserting) is the switch Insert here (`dec_insert_step`), once stable names for faces and edges exist (`dec_stable_reference_mechanism`).
4. **Change a step's numbers.** The row of a step that has numbers (an extrusion's depth, the size of a fillet or chamfer, a hollow's wall, a push or pull's distance, the amount of a move, a turn or a scale, a revolve's angle and advance) has a pencil: it opens the numbers in the panel; typing a number and Enter (or leaving the field) makes the command `setStepParams`, the model is made again from there, one undo takes it back. A step whose number the kernel cannot take is shown red, as before. A repeat keeps its own way of editing (its pencil opens the repeat, `in_257`).
5. **Only at the last step.** The numbers can be changed only while the cursor is at the end of the history; at an earlier point the pencils are not shown (a change then would drop the later steps). The panel says "go to the last step to change numbers".

## Rationale

The history is a list of commands with a cursor, and the scene at each point is kept, so moving to a step costs nothing and loses nothing; that is the kind of "move to different spots" that is safe to give now. A rollback that shows the model with later steps suppressed while keeping their numbers would need the later steps to be left out of the drawing, the picking and the sketches they used up, in every part of the program that reads the list of steps; the cursor gives the same look at an earlier state without that. Changing a step's numbers is what `setStepParams` already does (a push of a face makes it), so the pencil only gives it a place; keeping it to the last step avoids dropping steps by a change of a number.
