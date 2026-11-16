---
id: dec_sketch_recipe_synced
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_563, in_564, in_565, in_566, in_567, in_568, in_569, in_570
date: 2026-11-16
depends_on:
  - dec_sketch_belongs_to_step: this keeps it (a sketch is the recipe of the step that consumed it, never a separate copy) and adds a name and a status to the sketch
  - dec_sketch_follows_body: this keeps it (a move, turn or scale of the whole body carries the sketch) and says what else keeps the sketch in step with the body, and what does not
  - dec_modifications_are_steps: this keeps it (an edit the sketch cannot express is a new step on top of it; the sketch is not rewritten by later steps)
  - dec_face_edit_by_step: a push of a face the body has changes the step that made it, which is what keeps the sketch and the body in step for those edits
  - dec_stable_references: living on a face of the body, and following it when that face is edited, needs the face to have a name that survives edits; until then only whole-body motions move the sketch
---
# A sketch is the recipe of its step, kept in step with the body wherever it can express the change, and labelled where it cannot

**Approved (`in_570`).** The human asked whether a sketch should move and morph with the body it made, becoming part of it, or whether the sketch and the body are separate things that can drift apart (`in_564`), reframed it as where the sketch lives (`in_565`), asked whether the two are not always in sync (`in_566`, `in_567`), and asked for this to be written up (`in_569`). What the app does now was checked on a block (`in_566`): a push of a side face changed the sketch (its corners went from 10 to 14, no step added); a fillet changed the body and left the sketch sharp; a corner moved with the shape editing changed the body and left the sketch alone.

**The rules**

1. **One object, not a copy.** A sketch is the recipe of the step that consumed it (`dec_sketch_belongs_to_step`). No second "original" copy is kept anywhere: a copy drifts from the recipe, and two things that look alike and differ are the confusion the human wants to remove.
2. **Where it lives.** A sketch lives on the surface it made (the starting face of its extrusion, or the face it was drawn on), not at the place where it was first drawn. It moves with the body: now, through the whole-body motions (`dec_sketch_follows_body`); later, through every edit of that face, once the face has a name that survives edits (`dec_stable_references`). When the face stops being flat the sketch follows its plane while the face is flat; when the face is gone the sketch stays where it last was and is marked **detached**.
3. **What it looks like.** The shape of a sketch stays as it was drawn. A later fillet, hollow, cut or shaping of corners changes the body, not the sketch (`dec_modifications_are_steps`). A sketch changes only through an edit the sketch can express: a push of one of its sides, a change of the depth or of a circle's radius (`dec_face_edit_by_step`), a move, turn or scale of the whole body, or an edit of the sketch itself. Those keep the sketch and the body in step because the body is made again from the sketch.
4. **A status on every sketch**, shown beside it, so a sketch is never taken for the current shape of the body: **as drawn**; **carried by** a move, turn or scale (naming the step); **changed by** a push or a size (naming the step); **the body has changed since** by a named step (a fillet, a hollow, a cut: the sketch is the recipe, not the body's outline now); **unused** (drawn, not yet taken by a step); **detached** (its face is gone).
5. **A name.** Each closed figure (its outer loop and the figures inside it) gets a name when it is drawn ("Sketch 1", in the order drawn, kept for good), by the same idea as the bodies' names; the step that takes it refers to it by that name. It is listed in the Model panel (`in_563`) under the step that owns it; one that no step has taken is listed as unused.
6. **Seeing and editing the original.** To see a sketch, go to its step in the Model panel (the History): the sketch's row is under it; choosing it shows the sketch in the 3D view and takes edits, and an edit makes the body again from it. The sketch seen is the recipe as it is now, with the status above, not a frozen first drawing.

**Later work, not decided here (each needs its own approval)**
- Extend the edits the sketch can express: a fillet of a vertical edge of an extrusion as a rounded corner of the sketch; a sideways move of a corner of the base as a move of the matching sketch corner (the shaping by corners, `dec_direct_shape_editing`, does not touch the sketch today).
- The follow of the sketch on every edit of its face (rule 2) waits for names that survive edits.
- What "view the model at step N" shows for a sketch: as it was drawn at that step.

## Rationale

The human asked that the sketch and the body feel like one thing, and that the two be always in step. They cannot be literally always in step: a fillet of a top edge, a hollow, a cut or the shaping of one corner makes geometry that no flat profile describes, and a step that reads its sketch back through steps that come after it would make the history circular (`dec_sketch_follows_body` could do it only for motions that move the whole body without changing its shape). What can be had is that every edit the sketch can express **is** an edit of the sketch, which already holds for pushes of faces, depths, radii and whole-body motions, and that every other change says so on the sketch instead of leaving the sketch to look like the current shape. That is the smallest change to what was accepted: no accepted decision is changed; this adds a name, a status, the rule of where a sketch lives, and the place to find it.
