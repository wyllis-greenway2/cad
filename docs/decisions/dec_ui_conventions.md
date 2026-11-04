---
id: dec_ui_conventions
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_026, in_027, in_028, in_029
date: 2026-11-04
depends_on:
  - dec_ui_build_order: the conventions govern the sketching and extruding stages of the staged interface build
---
# Conventions: familiar navigation and hotkeys, minimal chrome, extrude like Shapr3D

Approved by the human as a starting point (`in_028`); everything is a remappable setting, not hardcoded.

1. **Mouse navigation.** The left button is always the tool (draw or select), never navigation. Right-drag orbits,
   middle-drag pans (Shift + right-drag also pans), the wheel zooms toward the cursor; presets for Fusion-like and
   SolidWorks/Blender-like (middle-button orbit) users. Orbiting away from the sketch plane drops it. The human drove
   Shapr3D with a mouse.
2. **Hotkeys and undo.** V select, L line, R rectangle, C circle, E extrude, D dimension; Esc steps back one level
   (cancel the shape, leave the tool, leave the sketch); Enter confirms; Delete removes; Ctrl/Cmd+Z undo,
   Shift+Ctrl+Z or Ctrl+Y redo. Undo covers model changes, not camera moves.
3. **Workflow.** Plane, draw, the sketch finishes on its own when you orbit away or press Esc (no Finish button),
   closed shapes become extrudable, and a history list is the model (the blueprint's operation graph: edit a number
   in it and the model rebuilds). The history list stays hidden until the first operation exists.
4. **Typing a number.** While drawing, just start typing: a small field appears at the cursor (width then Tab for
   height; diameter for a circle; length then Tab for angle for a line). Enter commits, Esc cancels, the direction
   comes from the cursor, and fields accept simple math such as `50/2`.
5. **Less in your face (the human's main wish about Shapr3D, `in_028`).** No permanent toolbars: put things in a
   right-click menu, a drawer and hotkeys. A right-click without dragging opens the menu; right-drag orbits.
6. **Extrusion defaults like Shapr3D (`in_028`).** Pulling a region in the positive direction adds material; pulling
   it in the negative direction subtracts (cuts) from the existing body.

Correction after hands-on use (`in_029`): the human got locked in a sketch with no way back to the 3D view. Leaving a
sketch must always be obvious and possible: Esc glides the camera back to the 3D view it came from, the status line shows
a "3D view" button, and left-drag (when the left button has no tool action) and Alt + left-drag also orbit, so a missing
right or middle button can never trap anyone.

Status (stage 2 of `prototypes/cad-ui`): navigation presets and the keymap are data in `settings.input`; items 1, 2 and
4 are implemented, and item 5 (right-click menu, no toolbar) is started. Not built yet: the history list, the drawer,
the dimension tool, and extrusion (item 6).

## Rationale
The human asked for navigation, a few hotkeys plus undo and redo, the sketch-finish-extrude workflow with a history
list, and typing a number to be done right, and said Shapr3D (their only well-liked program) is a reference but
not to be copied (`in_027`). Following Fusion/Onshape-style letter keys and offering navigation presets lets new
users keep the hands they already have, and the clutter and extrusion preferences come directly from the human.
