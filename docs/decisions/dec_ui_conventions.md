---
id: dec_ui_conventions
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_026, in_027, in_028, in_029, in_031
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

Second correction (`in_031`): zooming and panning at different amounts could lose the origin in fog. Cause: zoom-to-cursor moves the
camera target, and zooming OUT around the cursor multiplied that offset. Fixes: zoom in toward the cursor but zoom out about the view
center, anchor only on plane points near the target, show a "return to origin" prompt when the origin is lost, and add an O hotkey and a
menu item.

Status (`prototypes/cad-ui`): navigation presets and the keymap are data in `settings.input`; items 1, 2 and 4 are implemented, and item 5
(right-click menu, no toolbar) is started. **Dimension tool built (`in_034`, AI's design, not yet reviewed by the human):** D, point at a
shape and its dimensions show (rectangle W and H, circle diameter, each polyline segment length); click a number or just type, Tab for the
next, Enter applies them as one undoable change. There is no constraint solver (`q_constraint_solver` is open), so a dimension is a direct
edit, not a stored constraint: a rectangle keeps its first corner, a circle its centre, an open polyline moves everything after the edited
segment along. 
**Extrude built (`in_034`, AI's design, not yet reviewed by the human):** E, click a closed shape; the view tilts to 3D with an arrow; drag
anywhere (or type a distance, math works) to pull it: positive adds, negative cuts when there is a body (otherwise it adds the other way);
Enter applies, Esc cancels. The result is exact OCCT geometry (the `sketch-extrude` worker, copied into `cad-ui`; this does not decide
`q_kernel_choice`) with an instant translucent ghost until it arrives. A small "History (n)" list appears top left once something is
extruded; click an entry to change its distance, Delete removes it, Ctrl+Z / Ctrl+Y undo and redo it together with sketch edits. Limits:
sketching is on the three base planes only (no sketching on body faces yet), and an extrusion keeps a copy of its shape, so editing the
sketch later does not change it. **Selection model (`in_036`, `in_037`; AI's design, not yet reviewed by the human):** in the 3D view, clicking selects (a plane, a flat axis-facing face
of a body, or an unextruded closed sketch shape) and never moves the camera; actions then apply to the selection: **E** extrudes a closed shape or
push/pulls a body face (out adds, in cuts), **S** or a sketch key sketches on it (the only thing that goes orthographic, face-on), Esc deselects.
A sketch on a body face uses a frozen copy of the face's plane (see `q_topological_refs`); a push/pull feature finds its face again by position and can
fail if earlier steps move it. Slanted and curved faces are not selectable yet. In sketch view E with a closed shape selected pulls it, otherwise
picks one. Not built yet: the drawer.

**Selection levels, modify and transform (`in_038`; AI's design, not yet reviewed by the human):** a single click selects a corner, a line (within a few
pixels), a face, an unextruded sketch shape or a plane; a **double-click selects the whole body**. With a body selected: **M** move, **T** rotate,
**K** scale (X / Y / Z picks the axis; drag or type a number; rotate and scale are about the body's box centre). With a face: **E** push/pull, **S**
"sketch from this face". Lines and corners can be selected but cannot be modified yet. The last plane that was showing keeps showing when nothing is
selected or pointed at. See `q_direct_modification` for the open question on how direct modifications relate to extrusion and history.

## Rationale
The human asked for navigation, a few hotkeys plus undo and redo, the sketch-finish-extrude workflow with a history
list, and typing a number to be done right, and said Shapr3D (their only well-liked program) is a reference but
not to be copied (`in_027`). Following Fusion/Onshape-style letter keys and offering navigation presets lets new
users keep the hands they already have, and the clutter and extrusion preferences come directly from the human.
