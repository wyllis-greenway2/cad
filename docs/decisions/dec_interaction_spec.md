---
id: dec_interaction_spec
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_040, in_064, in_065, in_066, in_067, in_068, in_069, in_070, in_073, in_074, in_075, in_077, in_078, in_079, in_080, in_081, in_082, in_083, in_085, in_088, in_090, in_094
date: 2026-11-05
depends_on:
  - prin_input_agnostic: the device behaviours below are the mapping from each device to the same intents
---
# The interaction spec to keep: what any rebuild must reproduce

The human does not want these ideas lost when the engine is rebuilt clean (`in_094`: "I also dont want to lose the xyz ideas, the viewport rotating around center of object ideas, the worldview manipulation we have for different devices. I also dont want to lose the single double triple click interface etc."). This is the list, gathered from the decisions and the prototype (`prototypes/cad-ui`, its README, and `dec_ui_conventions`). Each line traces to a human input; this consolidation is the AI's and has not been reviewed: correct anything wrong. A rebuild is done when it passes these (they are the acceptance list).

## World and look
- A white world. Charcoal pencil X, Y, Z axes that stop at their arrows; never seen through objects. The model and world planes are grey. (`in_064` to `in_066`)
- Three small rounded translucent grey panes floating out from the corners of the axes: pointing at one makes it a little greyer; a click selects it. **World planes never turn teal** (`in_079`).
- The home view looks from the +X +Y corner at about 29 degrees up (`in_069`).
- When the first object exists, the axes shrink and slide into the bottom-right corner as a small compass with X, Y, Z buttons; clicking the compass sends the axes back big to the origin (a faint copy stays in the corner), and again to return (`in_068`, `in_070`). Undoing back to nothing sends them home.
- The faint sketch grid (light grey) is always on, on the world plane that is on (the floor to begin with), seen from the side as a patch about the view's middle and from straight on as a full grid; it follows a selected plane when looking straight at one (`in_066`, `in_072`; always on and one world plane at a time since `in_190`). Three little semi-transparent panes beside the axes, and the X Y Z buttons, turn another world plane on and look straight at it; only the plane that is on is found by the pointer and carries the hover circle.
- No helper text, no origin prompt, no grid-size text; a line appears only for a message about something refused or done, or a kernel error. The history panel is hidden until a place is chosen for it (`in_088`).

## Camera
- Orbit turns about the middle of the model when it is in view and the model **stays exactly where it is on screen** (no auto re-centring); otherwise about the current target (`in_081`, `in_082`).
- Looking straight at a plane is always orthographic; otherwise perspective (`in_070`).
- Pan, zoom to the cursor with a speed limit, return to origin (O), home (H).
- N looks straight at the selected or sketched plane from its front; again from its back; again from its front. X, Y, Z select that axis's plane and look along it, + then -, alternating each press (`in_068`, `in_069`). From the back the drawing is seen mirrored.
- A triple-click or double-click turns the view to a plane and centres on a clicked face (see the click grammar).

## Selecting: one grammar for every part
- **One click selects** what is under the pointer (pane, face, line, corner, closed shape, sketch part), never a whole object, never moving the camera (`in_069`, `in_070`).
- **Two clicks look straight at the plane clicked** (from the side you are on); **three select the whole object** (`in_083`).
- **Where several things overlap at the spot, repeated clicks cycle through them** instead (corners, then lines, then faces and planes; a shape before the face under it), with a short message "i of n here" (`in_088`).
- **Shift + click adds to the selection**, across kinds and in any order (body parts and sketch parts); Shift + click on a selected line takes it out. Several lines can be rounded or bevelled together as one step (`in_087`, `in_090`).
- A click on nothing lets go of everything; Esc lets go in two steps. The selection is ordered: **the first selected is the mover, the second the reference**; a part that cannot move (the body, an earlier step) is always a reference (`in_090`).
- Pointing at an object surface shows a small crisp ring at the cursor on the surface, in the colour a selected face shows; a click fills the surface with the transparent teal (`[0.1, 0.72, 0.7]` at 0.3) while the ring expands to the edges (`in_073` to `in_075`).

## Drawing and relations
- Press L, R or C (or choose it from the menu), then click any surface (pane, face, closed shape): that surface's plane takes the drawing, from wherever the camera is. A tool draws one figure and hands back to select, leaves the sketch and selects the new closed figure (`in_069`, `in_079`, `in_080`). Typing a size while drawing works. Lines left unfinished stay as an open line; only a closed shape extrudes (`in_062`).
- There is no sketch mode and no isolation: every sketch's parts, faces, planes and body corners and lines can be hovered, clicked and related at any time (`in_084`, `in_085`).
- Relations come from one table by kind of part (`dec_relations_standard`): geometric ones and numeric ones that are measured, then locked; distances between two corners, a corner and a line, two parallel lines; pins and parallel or perpendicular to body parts follow the body when it is rebuilt. Deleting a shape removes the constraints that used it and undo restores both (`in_085`).

## Devices (the same intents on every device, `in_077`, `in_078`, `in_079`)
- **Mouse:** click, double, triple click as above; right click = menu; right-drag or Alt + left-drag orbit; middle-drag, Shift + right-drag, Shift + scroll, Space + drag pan; wheel zooms; drag on empty space orbits.
- **Trackpad:** two-finger scroll pans and a pinch zooms, like a phone screen, in an automatic mode that tells a trackpad from a wheel (a menu item forces pan or zoom); Alt + drag or drag on empty space orbits; two-finger click or the menu button opens the menu.
- **Finger:** one-finger drag orbits, two fingers pan and pinch zooms, tap, double tap, triple tap as the clicks, long press = the menu (also the menu button); while an operation runs or a sketch point is under the finger the finger works like the mouse.
- **Pen (to come):** a precise pointer like the mouse (hover, barrel button = menu); fingers navigate.
- Tap targets are at least about 44 px; nothing is reachable by only one device.

## Deliberately dropped (do not bring back)
The sheet and dark styles and the style switcher, the touch shadow, the soft orb, infinite world planes and grids, the sketch mode and the S key, double-click-to-orient, the square / 3D-angle toggle, the Normal button, the origin prompt, the bottom-left hints, the tuning panel.

## Rationale

A rebuild is only safe if the behaviours the human liked are written down where a test can check them. This list is the contract between the prototype and the clean engine, and it is organised the way the engine will be: one selection grammar for every part, one camera, one set of devices mapped to intents.
