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

- **One helper for everything a mouse does by pressing, dragging and letting go (`in_284`, replaces the first rule of `in_283` that a tap anywhere sets the second point):** a finger has no hover and cannot do press, drag, let go on small arrows, so it is offered two round icons that always come as a pair: a **finger-drag** icon and a green **check**. While a figure is drawn (the first tap starts it, like a click) the drag icon moves the cursor like a hover and the check is the click that sets the point. For an operation that is dragged (Move, Turn, Scale, push / pull, extrude, fillet / chamfer, the arrows of a repeat) a tap selects the arrow or ring; the drag icon then drags it exactly as the mouse would, and the check applies the operation (when one is open; an operation's only arrow is offered at once). A tap on another arrow selects that; **a tap anywhere else is a right click** (`in_285` corrected `in_284`, which had said cancel): an operation that is open is applied, a tool is put away; with nothing open (an arrow only selected) it is an ordinary click. It is one mechanism in the input layer (`TouchHelper`, `Frame.touchHelper`): the controller is told nothing about fingers, it gets the same `hover`, `orbit` + `dragEnd`, `click` and `escape` intents a mouse makes.
- **Helpers only a finger needs, as before:** the drag icon (a tap on it does nothing).
- **A long press is a right click** and is told what is under it by looking at the point (a finger has no hover): a sketch tool chosen from the ring turns the view straight to the plane or face there, as with a mouse.
- **Undo and redo are always on the screen** (bottom left) once a touch has been used; a mouse has the keys and the menu.
- **The tool chip at the top:** once a figure is made (and none is half drawn) its cross becomes a **check** that puts the tool away (it is "done", not a cancel); the check flashes green and fades at each figure made, and when an operation opens (the one with apply and cancel), to show it is there to press. Mid-figure the cross cancels that figure.

Not done: the touch icons are a first drawing (the finger-drag icon especially); a drag that begins on a corner of a drawing has no helper yet; the face drag arrow of an operation that has not been started (only selected) offers the drag icon but no check; not tried on a real phone.

## Rationale

`prin_input_agnostic` asks that nothing exists only on one device. The long-press menu, the sketch-on-a-face rule and the apply gesture were reachable on a mouse through hover and a right click; on touch they were missing or different. The behaviour is in the shared controller, not in the screen code, so the mouse and the finger take the same path; only the extra helpers (drag handle, apply icon, undo bar) belong to touch.
