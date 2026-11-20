---
id: dec_chord_and_trash
kind: decision
status: accepted
origin: human
human_input: in_1281
date: 2026-11-20
depends_on:
  - dec_interaction_spec: the mouse and touch gestures and the apply-or-cancel rules this adds to
  - dec_menu_picking: the ring's items, which lose the Actions list
alternative_to:
---
# Drag select for a finger and for two buttons; a spline applied by a right click; Delete in the ring, Undo and Redo in the ⋯ list

- **Drag select, for a finger:** the Select list of a finger's ring (the one a long press opens; a mouse's ring does not show it, as with Add mode) has **Drag select**: the next drag draws the selection rectangle instead of turning the view, from where the drag began, and selects what is in it as a held left button's rectangle does (`in_235`). It is for one drag (Esc gives it up; with Add mode on, the rectangle adds).
- **Drag select, for a mouse:** the left and the right button pressed together (one while the other is held, still) begin the same rectangle at once, with no wait for the hold; letting up ends it; neither button then clicks or opens the menu. Not while a tool or an operation is open (as a hold is not).
- **A spline is applied by a right click:** with two or more points placed, a right click out in space makes the spline from the points, as Enter does, instead of putting the tool away; with fewer it puts the tool away, as before.
- **Delete is one item of the ring** with no list: it deletes what is selected, or, with nothing selected, the thing the right click was on; dimmed when neither is there. The **Actions** list is gone: **Undo and Redo are rows at the top of the ⋯ list** (dimmed when there is nothing to undo or redo), "for now".

## Rationale

The human's words (`in_1281`): a finger has no way to draw a rectangle, a right click on a half-drawn spline threw the work away, and the trash bubble was a list of three things where one is wanted at once. The ring item and the ⋯ rows keep their ids (`delete`, `undo`, `redo`), so the keys and the actions that name them are as they were.
