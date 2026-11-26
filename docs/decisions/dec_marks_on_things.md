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

## Built (`in_1612`)
The mark drawer and the rule: `next/src/interaction/marks.ts` (pure: `marksFor` gives the marks to show and `alphaAt` the fade; one rule; an offer is what is true as drawn and near, `holds`, or a near one with another part; what merely could be added is in the menu), `next/src/chipdraw.ts` (the chips shared with the info bar), `next/src/markdraw.ts` (the drawer: a lock on each chip, green locked, yellow open, red flashing; a mark that would cover another stands beside it), `sketchcontrol.ts` (`marks(now)`, the parts just made kept in `recent` for `settings.marks.stayMs`, `offer` on a click selects the parts and applies it; the auto-selection of the part just made and the sketch's selection in the info bar are gone). The info bar still carries the numbers of a figure being drawn, operations and body picks. `dev/marks-check.ts` (the rule), `dev/tangent-browser.ts` (offer on the line just made unselected, it fades, selected it is there again, a click locks it, a click on the locked one lets it go). The numbers of a figure being drawn are marks on it too (`in_1613`): a line's length and a circle's diameter at the middle of what is being drawn, a rectangle's width on its bottom side and its height on the side at the pointer; open yellow while measured, closed green once typed; they are not clicked (they take digits from the keys and must not be in the way of the click that ends the figure). A mark stands directly on its part (its lower edge touches it, so the part can still be pressed; centred on it, it hid a selected corner and the middle of a line) and a press and drag moves it out of the way; the position is not remembered once the mark is gone (deselected, then selected again, it stands on the part again). The offers for a part just made end when another tool takes the clicks (Extrude, an operation). The info bar is now only for operations and body picks (`sk.subject` is gone). `dev/marks-browser.ts`. Not yet: placement that keeps away from the geometry; the status stays provisional until the human has seen it.

## Rationale

The info bar put the constraints away from the geometry they are about and needed a second place to look; the human wants to see a constraint on the line it constrains and to say yes with the same lock everywhere (`in_1611`). One mark type, one anchor function and one visibility rule keep it as small as the info bar was.
