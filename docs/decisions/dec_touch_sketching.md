---
id: dec_touch_sketching
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_283
date: 2026-11-12
depends_on:
  - prin_input_agnostic: touch must reach the same actions as the mouse, with extra helpers only where a finger needs them
alternative_to:
---
# Sketching with a finger: the same clicks as the mouse, plus helpers

The human found sketching on a phone hard (`in_283`) and asked for it to work the way it does with a mouse, with a few extras for a finger. Built as a first try, all provisional until used on a phone:

- **A tap is a click**, also while a figure is being drawn: the first tap starts it, the next sets it (a rectangle, circle, line or curve is set by the tap that gives its last point). The cursor that follows a finger no longer takes taps as "move the cursor".
- **Helpers only a finger needs:** a round **finger-drag** handle beside the cursor drags the cursor about to place a point exactly (a tap on the handle does nothing); a green **apply** icon beside it sets the point where the cursor is.
- **A long press is a right click** and is told what is under it by looking at the point (a finger has no hover): a sketch tool chosen from the ring turns the view straight to the plane or face there, as with a mouse.
- **Undo and redo are always on the screen** (bottom left) once a touch has been used; a mouse has the keys and the menu.
- **The tool chip at the top:** once a figure is made (and none is half drawn) its cross becomes a **check** that puts the tool away (it is "done", not a cancel); the check flashes green and fades at each figure made, and when an operation opens (the one with apply and cancel), to show it is there to press. Mid-figure the cross cancels that figure.

Not done: the touch icons are a first drawing (the finger-drag icon especially); a finger drag that begins on the figure itself has no helper (only the cursor handle); not tried on a real phone.

## Rationale

`prin_input_agnostic` asks that nothing exists only on one device. The long-press menu, the sketch-on-a-face rule and the apply gesture were reachable on a mouse through hover and a right click; on touch they were missing or different. The behaviour is in the shared controller, not in the screen code, so the mouse and the finger take the same path; only the extra helpers (drag handle, apply icon, undo bar) belong to touch.
