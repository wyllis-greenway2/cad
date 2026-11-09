---
id: dec_interaction_spec
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_239, in_238, in_237, in_236, in_235, in_232, in_231, in_040, in_064, in_065, in_066, in_067, in_068, in_069, in_070, in_073, in_074, in_075, in_077, in_078, in_079, in_080, in_081, in_082, in_083, in_085, in_088, in_090, in_094, in_196, in_229
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
- **The sketch group** (`in_229`: "they should be added to the sketch group and that group should have rules, one of them being the normal to plane on selection rule"): the tools that draw on a plane (rectangle, circle, line, arc, trim) and the operations that work in one (offset) are one group, in `interaction/control/modal.ts`. Its rule: starting any of them turns the view straight to the plane of the one plane, face or sketch line selected (or of what the right click was on), from the side you are on. The group is written as records over every tool and operation kind, so adding a kind without saying whether it is in the group does not compile.

## Selecting: one grammar for every part
- **One click selects** what is under the pointer (pane, face, line, corner, closed shape, sketch part), never a whole object, never moving the camera (`in_069`, `in_070`).
- **Two clicks look straight at the plane clicked** (from the side you are on); **three select the whole object** (`in_083`).
- **Where several things overlap at the spot, repeated clicks cycle through them** instead (corners, then lines, then faces and planes; a shape before the face under it), with a short message "i of n here" (`in_088`).
- **Shift + click adds to the selection**, across kinds and in any order (body parts and sketch parts); Shift + click on a selected line takes it out. Several lines can be rounded or bevelled together as one step (`in_087`, `in_090`).
- A click on nothing lets go of everything; Esc lets go in two steps. The selection is ordered: **the first selected moves to meet the one selected after it** (`in_229`, reversing `in_196`, which had reversed `in_090`); a part that cannot move (the body, an earlier step) always stays.
- Pointing at an object surface shows a small crisp ring at the cursor on the surface, in the colour a selected face shows; a click fills the surface with the transparent teal (`[0.1, 0.72, 0.7]` at 0.3) while the ring expands to the edges (`in_073` to `in_075`).

## Drawing and relations
- Press L, R or C (or choose it from the menu), then click any surface (pane, face, closed shape): that surface's plane takes the drawing, from wherever the camera is. A tool draws one figure and hands back to select, leaves the sketch and selects the new closed figure (`in_069`, `in_079`, `in_080`). Typing a size while drawing works. Lines left unfinished stay as an open line; only a closed shape extrudes (`in_062`).
- There is no sketch mode and no isolation: every sketch's parts, faces, planes and body corners and lines can be hovered, clicked and related at any time (`in_084`, `in_085`).
- A sketching tool, once chosen, stays on after each figure (on the same plane) until a right click or the cross in the pill at the top of the page puts it away; this is a trial (`in_193`, after `in_147` took an earlier sticky mode out). While it is on, a right click cancels it instead of opening the menu (the ⋯ button still does).
- Relations come from one table by kind of part (`dec_relations_standard`): geometric ones and numeric ones that are measured, then locked; distances between two corners, a corner and a line, two parallel lines; pins and parallel or perpendicular to body parts follow the body when it is rebuilt. Deleting a shape removes the constraints that used it and undo restores both (`in_085`).

## Devices (the same intents on every device, `in_077`, `in_078`, `in_079`)
- **Mouse:** click, double, triple click as above; right click = menu; right-drag or Alt + left-drag orbit (`in_235` took back the drag select `in_230` had put on the right button); middle-drag, Shift + right-drag, Shift + scroll, Space + drag pan; wheel zooms; a quick drag on empty space orbits; **the left button held still for a while (0.4 s) changes the cursor, and a drag from there without letting up draws a selection rectangle** (`in_235`).
- **Drag select** (`in_230`, `in_235`): hold the left button still, the cursor changes, drag without letting up; let go, what is in the rectangle is selected (Shift adds to what is selected). Dragged from the left to the right it takes what is wholly inside (a solid outline); from the right to the left also what it touches (dashed). It picks edges (lines, arcs, circles) and, when there are none in it, corners; what a face of the body hides, what a step used up and the world planes are not picked. A tool or operation that is running has the pointer: nothing is picked then.
- **The move's number** (`in_230`, replacing the three bubbles of `in_215`): one bubble, on the arrow of the chosen axis (as the rotator shows one ring's number). It shows how far the move has taken the body along that axis since the move began: 0 to begin with, kept on across drags until the move is put away; a number typed in it is that position. The arrows stay with the body when a drag is let go (not back where it began until the kernel answers).
- **A fillet or chamfer from one edge** (`in_231`): the kernel rounds along the edges that run on smoothly from the chosen one (a rim of lines and arcs on one flat face), so the picture drawn while the size is dragged covers all of them, and the two halves of one rim are one circle. The number switch beside the move arrows or turning rings keeps off the number bubbles.
- **Inset / offset of a drawn figure** (`in_232`): works on a closed figure with arcs as well as straight sides (straight sides move parallel, arcs keep their centre and change radius, new ends where neighbours meet), on a chain of lines and arcs picked by its sides, and on a piece of a figure that lines cut up (it only reads the outline and draws a new figure). What a click on a face picks (the face, its sides and corners) is one figure. An inset that goes past the middle of a figure draws nothing.
- **Double click on a sketch** (`in_235`): a drawn figure with no body under it is selected and the view turns straight to it (there is no body for the double click to take); with a body under it (a sketch on a face) the double click still takes the whole object.
- **Typing with something selected** is one standard, `dec_typing_standard` (`in_235`).
- **Arrows are selectable and carry their number only when selected** (`in_238`): the arrows or rings of an operation (move, turn, fillet / chamfer, push / pull, extrude, offset, repeat) show no number bubble until one is selected: by a click on it or by taking it (dragging it). Typing a number also shows it (that is how a number is typed). The selected arrow is lit. It stays selected while its operation does, and is let go when the operation ends, a new one begins, or the selection changes (a click elsewhere). The move shows the position along the axis of the arrow selected.
- **Constraints of a body** (`in_238`, `in_239`, `dec_hide_structural_constraints`): once a sketch has been extruded, the relations that only join the pieces of its outline (coincident, onLine, onCircle, arcEnds, made while drawing it) are not shown; dimensions, tangents and anything tying it to the outside are. "Constraints" in the ⋯ list shows all; a refused edit still flashes the ones that refused it.
- **Repeat** (linear, circular, copy; `in_236`, replacing the pill with the tick and the cross of `in_141`): it stays open while you work; **a right click leaves it and makes the copies** (with none to make it just leaves), Esc gives it up. A linear repeat starts with **one** (no copy yet) and a helper bubble on the arrow past it, "pull to copy"; once a copy exists that bubble goes and "pull to separate" stands on the spacing arrow until the copies are moved apart a little. Each helper shows once in each use of the tool. Until the helpers have been used up, only the arrows of the direction they are about are shown; then the other directions come (`in_237`). **Only the arrow that was taken last** (dragged, or its number typed) shows its number, as only the chosen ring of a turn does. A copy starts with its one copy, so only "pull to separate" shows.
- **A busy kernel** (`in_236`): when the model is not worked out yet, a small "Working…" sign shows after a third of a second, so a big job does not look like a broken app. Repeats join their copies in pairs, and copies that stand apart are one compound without joining at all (a hundred copies: 4 s became 0.8 s).
- **Hints for arcs** (`in_230`): a line being drawn ends on an arc, or is tangent to it, as it does for a circle, and the arc lights amber as the circle does (the hover blue is not drawn over it).
- **Trackpad:** two-finger scroll pans and a pinch zooms, like a phone screen, in an automatic mode that tells a trackpad from a wheel (a menu item forces pan or zoom); Alt + drag or drag on empty space orbits; two-finger click or the menu button opens the menu.
- **Finger:** one-finger drag orbits, two fingers pan and pinch zooms, tap, double tap, triple tap as the clicks, long press = the menu (also the menu button); while an operation runs or a sketch point is under the finger the finger works like the mouse.
- **Pen (to come):** a precise pointer like the mouse (hover, barrel button = menu); fingers navigate.
- Tap targets are at least about 44 px; nothing is reachable by only one device.

## Deliberately dropped (do not bring back)
The sheet and dark styles and the style switcher, the touch shadow, the soft orb, infinite world planes and grids, the sketch mode and the S key, double-click-to-orient, the square / 3D-angle toggle, the Normal button, the origin prompt, the bottom-left hints, the tuning panel.

## Rationale

A rebuild is only safe if the behaviours the human liked are written down where a test can check them. This list is the contract between the prototype and the clean engine, and it is organised the way the engine will be: one selection grammar for every part, one camera, one set of devices mapped to intents.
