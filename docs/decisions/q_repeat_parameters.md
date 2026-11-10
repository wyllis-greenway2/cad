---
id: q_repeat_parameters
kind: question
status: open
origin: ai-unreviewed
human_input: in_257
date: 2026-11-10
depends_on:
  - dec_stable_references: a later step that names one copy must still find it when the count or the spacing changes, so the copies need names that stay valid
alternative_to:
---
# Should a repeat keep its numbers so it can be edited later, and how is it shown?

**What happens now:**
- A **repeat of the body** (linear or circular) is a step of the history with its numbers (`pattern`, `params`: counts, distances, angle, axis, point). It is editable in principle like any step; there is no way in the page to reopen it yet.
- A **repeat of a drawn figure** is not a step: it makes new corners, lines and a circle that are copies, and the relations among them (`pattern.ts`). After that they are ordinary drawn parts with no memory that they were a repeat, so there are no numbers to edit; the only way to change the count is to delete copies or draw more.

**Proposal:**
1. **A figure's repeat becomes a step too** (a "pattern" entry that names the source parts and holds the numbers). The copies are **derived** from it, like the faces of a body are derived from its steps (`prin_graph_is_truth`), with names that stay valid when the count changes (copy 3 of pattern p1 is always `p1.3`), so a later extrusion or fillet that uses copy 3 still finds it when the count goes from 6 to 8.
2. **Editing:** selecting any copy, or the pattern's row in the History panel, shows the same arrows and number bubbles it was made with, with the current numbers; changing them replays the step. (The same idea as grabbing a face to edit the step that made it, `dec_face_edit_by_step`.) Menu: "Edit repeat…".
3. **Can it break a body?** Yes, and it is handled as every change to an early step is: the change is tried, and if a later step can no longer be made, **it is refused with the step named** ("that would break a step made from it", already how `watchAll` works) and nothing changes. Raising the count is only refused if the copies would overlap so a later extrusion fails in the kernel; lowering it is refused if a later step uses a copy that would go. The result line says which.
4. **"Break the repeat"** (explode) turns the copies back into ordinary drawn parts, which are then free to edit one by one (this is what they are today). A copy cannot be moved or have its own constraints while it is derived; its relations to other things go to the source, so the whole pattern follows.
5. **Body repeats** need only the "reopen it" part (they are steps already).

**Cost:** it is a change to the file and the compiler (the derived copies and their names), the largest of the items in `in_257`. The first piece that needs no new concept is reopening a **body** repeat from its history row.

**Questions:** is a derived (locked) copy acceptable, with "break the repeat" to free it? Should lowering the count be refused or should it delete the steps that used the removed copies (after asking)?

## Rationale

Open until answered. It decides whether a repeat of a sketch is a thing the model keeps or only a way of drawing, which affects the file format and how the sketch is solved; it should not be settled by building.
