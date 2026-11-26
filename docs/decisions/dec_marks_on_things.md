---
id: dec_marks_on_things
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1611
date: 2026-11-26
depends_on:
  - dec_helpers_one_rule: what is offered is still `offerable` (new, or true as drawn and the solver would accept; never already said or refused)
  - dec_dimensions_measure_then_lock: a number is measured, then locked; the lock is the same lock
alternative_to: dec_three_surfaces
---
# Marks on the things: one lock for applied and offered constraints (proposed)

The human found moving a sketch's constraints and numbers into the info bar a mistake (`in_1611`) and asked for a model where every bubble lives on the thing it stands for, with one lock symbol for applied and not applied. Proposed (the human has not yet approved the detail):

- **One kind of mark**, anchored on the part it is about (`anchorOf`), with one glyph, a lock: **locked, green** = the constraint (or number) is applied; **unlocked, yellow** = offered (`offerable` and near). A click on a yellow one locks it; a click on a locked one unlocks it (it is then offered again if it is still true and near, else gone). A number is the same mark with its value, typed over as now.
- **One rule for when a mark shows** (one predicate): a locked mark shows when its part is selected; an offered mark shows when its part is selected, or, after a figure is drawn or a part dragged, for a short time and then fades, even when nothing is selected (as before the info bar); a **refused** one (a thing the person tried to break) shows red and flashes **always**, selected or not, for as long as the refusal stands. Nothing else shows.
- The auto-selection of the part just made goes (the timed offer takes its job).
- The info bar stays for operations (their number and kinds) and what is picked on a body; for a sketch it is not used.
- Marks live in the model's space with the thing, like a handle (`dec_task_handles`), so this is not a fourth surface; this entry narrows the info bar of `dec_three_surfaces` and, if approved, that entry is changed in place.

## Rationale

The info bar put the constraints away from the geometry they are about and needed a second place to look; the human wants to see a constraint on the line it constrains and to say yes with the same lock everywhere (`in_1611`). One mark type, one anchor function and one visibility rule keep it as small as the info bar was.
