---
id: dec_repeat_parameters
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_257, in_258
date: 2026-11-10
depends_on:
  - dec_stable_references: a later step that names one copy must still find it when the count or the spacing changes, so the copies need names that stay valid
alternative_to:
---
# A repeat keeps its numbers so it can be edited later

**Accepted and built** (`in_258`: "I will take your recommendations on all"). How it was built, which differs a little from the sketch below: a repeat of a drawn figure is a **record in the scene** (`Scene.patterns`: the parts repeated, their plane, the numbers; `operation/repeat.ts`) saved in the file and made by the commands `pattern`, `setPattern` and `breakPattern`; its copies are **made from the record each time the scene is derived** (`withDerived`), so they follow the original, are not saved as parts, and are **locked** (not movable or deletable) until the repeat is broken; copies are named by which copy of which part (`d/q_003.c2_e_001_p0`), so a constraint or step made from copy 2 still finds it when the count changes; copies carry no relations of their own (they are what the original is). **Edit repeat** and **Break repeat** are in the ring and the ⋯ list (Move and repeat); a repeat of the body (a step) is reopened from its row in the History list. Changing the numbers is refused, with the constraint or step named, if it would take away a copy that something uses (`setPattern`), and the repeat stays open to try another number. Old files, whose repeats are ordinary parts, open as before. `test/repeat.test.ts`. **Not built:** the pivot of a circular repeat is still made from parts while it is edited, as when it was made.

**What happened before:**
- A **repeat of the body** (linear or circular) is a step of the history with its numbers (`pattern`, `params`: counts, distances, angle, axis, point). It is editable in principle like any step; there is no way in the page to reopen it yet.
- A **repeat of a drawn figure** is not a step: it makes new corners, lines and a circle that are copies, and the relations among them (`pattern.ts`). After that they are ordinary drawn parts with no memory that they were a repeat, so there are no numbers to edit; the only way to change the count is to delete copies or draw more.

**Proposal:**
1. **A figure's repeat becomes a step too** (a "pattern" entry that names the source parts and holds the numbers). The copies are **derived** from it, like the faces of a body are derived from its steps (`prin_graph_is_truth`), with names that stay valid when the count changes (copy 3 of pattern p1 is always `p1.3`), so a later extrusion or fillet that uses copy 3 still finds it when the count goes from 6 to 8.
2. **Editing:** selecting any copy, or the pattern's row in the History panel, shows the same arrows and number bubbles it was made with, with the current numbers; changing them replays the step. (The same idea as grabbing a face to edit the step that made it, `dec_face_edit_by_step`.) Menu: "Edit repeat…".
3. **Can it break a body?** Yes, and it is handled as every change to an early step is: the change is tried, and if a later step can no longer be made, **it is refused with the step named** ("that would break a step made from it", already how `watchAll` works) and nothing changes. Raising the count is only refused if the copies would overlap so a later extrusion fails in the kernel; lowering it is refused if a later step uses a copy that would go. The result line says which.
4. **"Break the repeat"** (explode) turns the copies back into ordinary drawn parts, which are then free to edit one by one (this is what they are today). A copy cannot be moved or have its own constraints while it is derived; its relations to other things go to the source, so the whole pattern follows.
5. **Body repeats** need only the "reopen it" part (they are steps already).

**Cost:** it is a change to the file and the compiler (the derived copies and their names), the largest of the items in `in_257`. The first piece that needs no new concept is reopening a **body** repeat from its history row.

**Questions that were asked:** is a derived (locked) copy acceptable, with "break the repeat" to free it? (yes) Should lowering the count be refused or should it delete the steps that used the removed copies (after asking)? (refused, `in_258`)

## Rationale

Decided, `in_258`. It decides whether a repeat of a sketch is a thing the model keeps or only a way of drawing, which affects the file format and how the sketch is solved; it should not be settled by building.
