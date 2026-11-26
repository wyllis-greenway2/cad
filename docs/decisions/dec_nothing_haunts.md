---
id: dec_nothing_haunts
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1623
date: 2026-11-26
depends_on:
alternative_to:
---
# Deleted means gone: nothing haunts a sketch

What the human found (`in_1623`): a circle snapped to a line that had been deleted. The cause was a point no figure had any more (the line's end, kept because a constraint named it): invisible, because points are not drawn until picked, and yet a place for the hints to snap to. The old prototype had this fault everywhere ("their souls walked the app forever").

Proposed rule (not yet approved): **a sketch holds only what a figure holds.** A point exists only while a line, a circle or an arc uses it; nothing names a part that is not there (a constraint, a line with an end that is gone). `tidy` (`next/src/interaction/drawing.ts`) takes away whatever is left over, and it is applied at every place a sketch is changed or comes in: a deletion (`removeParts`), every change the sketch controller keeps, an undo, and a file that is opened (so a file made before the fix is healed on opening). The sketch is the same object when there is nothing to take away. Any new kind of part (a spline, a text, a hole) says what it is made of and what uses it, so `tidy` can tell when it is left over.

**Audit of the other places (`in_1624`).** Looked at by running the page and reading what each part keeps: found and fixed (a) a sketch drawn on a face kept its link to the body's step when the step was taken out, so an extrude of it would name a step that is not there; it is now a free drawing, as `dec_sketch_on_face_follows_body` says (`liveSource` in `main.ts`); (b) a file held empty drawings and planes on faces that nothing was drawn on, for ever (`documentNow` leaves them out, keeping the plane being drawn on); (c) a part that was selected and is gone stayed in the selection (`selected` in `sketchcontrol.ts` keeps only what is still there); (d) the orb remembered where it had been put on the sketch plane, and for every finished move draft, so the next plane or draft started with it off centre or the memory grew (`orbcontrol.forget`, called when a plane is placed and when a draft ends). Looked at and found fine: the timed offers (kept only for parts that are there), the constraint flashes (shown only for constraints that exist), the pick on a body (dropped when the body is made again), the notices (cleared with their tool), the marks' drag memory (dropped when the mark goes), the undo stack (history on purpose), the steps taken out of a recipe (their dependents are shown as orphaned in the step list, in the engine's words, on purpose).

Checked by `next/dev/tidy-check.ts` (the file the human sent, a line deleted whose end was held on a circle, a file cut short) and `next/dev/leftovers-browser.ts` (a sketch on a face whose body is taken out; what a file holds).

## Rationale

A thing that is not drawn must not take part in anything that is: a snap, an offer, a constraint, a solve. Taking leftovers away at the places sketches pass through, and not hunting for them in every feature that reads a sketch, is what keeps the rule from needing a new case each time.
