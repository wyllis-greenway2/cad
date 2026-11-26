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

Checked by `next/dev/tidy-check.ts` (the file the human sent, a line deleted whose end was held on a circle, a file cut short).

## Rationale

A thing that is not drawn must not take part in anything that is: a snap, an offer, a constraint, a solve. Taking leftovers away at the places sketches pass through, and not hunting for them in every feature that reads a sketch, is what keeps the rule from needing a new case each time.
