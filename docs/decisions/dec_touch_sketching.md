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

- **Sketching with a finger (`in_286`, replaces the check icon and the "tap elsewhere" rules of `in_283`..`in_285` for a figure being drawn):** a finger has no hover, so a point is *held* first and set by the next tap, and the hints a mouse's hover gives (on line, on circle, tangent, level, snaps) show on the held cursor. A tap with a tool on **holds the cursor there** (nothing is set yet); a **finger-drag icon** beside it moves the cursor with all the hints; the **next tap anywhere sets the point where the cursor is held and holds the cursor at the tap**, for the next point; the tap after the **last** point sets it and makes the figure, with nothing held (a tap after that holds the first cursor of the next figure). So tap, tap, tap makes a rectangle or circle (the first tap only aims). There is **no check icon**. One finger on empty space always orbits; two fingers pan and zoom. The trim tool has one step: a tap is a click. Built as the intent `tapAim` (controller `doTapAim`); the input layer only says "tap while a tool is on".
- **Operations that are dragged (`in_284`, `in_285`):** Move, Turn, Scale, push / pull, extrude, fillet / chamfer, the arrows of a repeat: a tap selects the arrow or ring; the finger-drag icon then drags it exactly as the mouse would (the same `orbit` and `dragEnd` intents). A tap on another arrow selects that; **a tap anywhere else is a right click**: an open operation is applied; with nothing open (an arrow only selected) it is an ordinary click. No check icon here either. It is one mechanism in the input layer (`TouchHelper`, `Frame.touchHelper`): the controller is told nothing about fingers.
- **A long press is a right click** and is told what is under it by looking at the point (a finger has no hover): a sketch tool chosen from the ring turns the view straight to the plane or face there, as with a mouse.
- **Undo and redo are always on the screen** (bottom left) once a touch has been used; a mouse has the keys and the menu.
- **The tool chip at the top:** once a figure is made (and none is half drawn) its cross becomes a **check** that puts the tool away (it is "done", not a cancel); the check flashes green and fades at each figure made, and when an operation opens (the one with apply and cancel), to show it is there to press. Mid-figure the cross cancels that figure.

Not done: the touch icons are a first drawing (the finger-drag icon especially); a drag that begins on a corner of a drawing has no helper yet; not tried on a real phone.

## Rationale

`prin_input_agnostic` asks that nothing exists only on one device. The long-press menu, the sketch-on-a-face rule and the apply gesture were reachable on a mouse through hover and a right click; on touch they were missing or different. The behaviour is in the shared controller, not in the screen code, so the mouse and the finger take the same path; only the extra helpers (drag handle, apply icon, undo bar) belong to touch.
