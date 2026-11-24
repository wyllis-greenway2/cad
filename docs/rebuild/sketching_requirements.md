# Sketching: the requirements (a draft from a first prototype)

Status: **a draft, `ai-unreviewed`**, written after a first prototype was built (`in_1462`) so the human can say what is right and what is not. No tests until he is happy with it (`in_1444`). The old app's sketching (`dec_interaction_spec`, `dec_sketch_*`, `dec_touch_sketching`, `in_147`, `in_193`) is far larger (arcs, polygons, constraints, typed sizes, snapping to many things, drag editing); only three tools are started, as asked.

## What there is now
- The right-click ring (as the old app's): a **pencil** bubble opens a ring of its own (an unfolding, a cross to go back) with **Line**, **Rectangle**, **Circle**; beside the pencil, **Sketch plane**.
- Choosing a tool **turns the view straight to the plane that is on** (a world plane, or the placed sketch plane), orthographic, unless it is already, and the tool is on.
- **Line:** each click lays the end of a segment, a chain; a double click ends the chain. **Rectangle:** two clicks, opposite corners. **Circle:** the middle, then a point on it. The tool **stays on** after each figure.
- What the next click would make is shown as the pointer moves (teal), with a small cross where the pointer is; figures done are charcoal lines.
- **Snapping:** the point goes onto an end, a corner or a middle of an earlier figure within 10 px, else onto a grid crossing within 10 px.
- **Right click** (or Esc) gives up the figure under way; with none, it puts the tool away; then the ring opens again.
- Since `in_1564` the figures are **the engine's own definition** (points, lines, circles, constraints), solved at every edit; selecting, a number on a part (D), typing over it, Delete and Trim (K9 to K29) are built, checked by dev checks (`dev/drawing-check.ts`, `dev/stress-drawing.ts`, `dev/sketch-browser.ts`) and not yet tests.
- Figures are kept **in the plane's own axes**, so they go with a placed plane when the orb moves it; a world plane keeps its own; a placed plane's are let go with it.
- The orb is out of the way while a tool is on.

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| K1 | The ring's pencil opens a ring of Line, Rectangle and Circle that unfolds from the pencil, with a cross that goes back; choosing a tool closes the ring. | in_1462 in_133 in_143 | right click without movement | `Intents` | browser | later |
| K2 | Choosing a tool turns the view straight to the plane that is on (orthographic) unless it already is, and the tool is on until put away. | in_1462 in_229 in_193 | | `ViewState` | browser | later |
| K3 | **Line:** a click puts the first point, each next click a segment from the last point; a double click ends the chain. **Rectangle:** two clicks, opposite corners (axis-aligned in the plane). **Circle:** a click for the middle, another for a point on it. A second click on the same place makes nothing. | in_1462 in_062 in_069 | click | `Sketch` | unit | later |
| K4 | The tool stays on after a figure; a right click or Esc gives up the figure under way, and with none puts the tool away. | in_1462 in_193 in_244 | right click, escape | `Sketch` | unit | later |
| K5 | A point sticks to an end, a corner or a middle of an earlier figure (the middle of a circle, and the four points on it) within 10 px, else to a grid crossing within 10 px of the grid's spacing; the distance is so many pixels wherever the view is. | in_1462 in_652 | | `Sketch` | unit | later |
| K6 | Figures are kept in the plane's own axes: they move and turn with a placed plane, and each plane keeps its own; a placed plane's figures are let go with it. | in_1462 in_233 in_234 | | `Sketch` | unit | later |
| K7 | What the next click would make is drawn as the pointer moves, with a cross at the pointer; figures done are charcoal lines, pixel-wide, drawn on top. | in_1462 | hover | `Drawing` | browser | later |
| K8 | Not yet: an arc tool, polygons, typing a size while drawing, adding a relation from a bar (the helper bar), closed figures making a face and an extrude of them, a sketch's own cut when it is on a face, undo. | in_1462 | | | later | later |

| K9 | A figure is the engine's own definition (points, lines, circles, constraints), one for each plane: a rectangle is four points, four lines, level and upright; a click on a point is that point; a click on a line or circle puts a new point held on it; every edit is solved before it is kept, and one the solver refuses leaves the sketch as it was and says which constraints hold it back. | in_1564 in_1562 | click | `Sketch` | later | later |
| K10 | With no tool on, a click selects a point, a line, a circle or an arc (Shift adds); the bubbles of the constraints of what is selected show on it, and only those; Esc puts the selection away; Delete takes the selected parts away with the constraints that name them and the end points nothing else uses. | in_1564 in_1562 in_058 | click, delete, escape | `Sketch` | later | later |
| K11 | D puts the number a selection measures on it (a length, a radius, a distance, an angle) as a dimension; its bubble is typed over, and the sketch is solved again or the bubbles that hold the number back flash red and the number goes back. | in_1564 in_034 | key D | `Sketch` | later | later |
| K12 | Trim is a tool in the pencil's ring: pointing at a line, arc or circle shows in red the part a click would take off (between the places others cross it); the click takes it off as an edit of the sketch (E87), and says what it had to let go. | in_1564 in_1560 in_1561 | click, hover | `Sketch` | later | later |

| K13 | The helper bar stands beside what is selected, up and to the right, kept on the page and clear of the bubbles: on the left what can be done with the selection (delete, put the selection away), on the right the relations that fit exactly it, the numbers first, those already true marked, those that cannot hold shown red with what holds them back, those that follow from what is there not offered. Pressing one puts it on the sketch or flashes what holds it back. It is the one place a suggestion appears, and it is not there while a tool is on or a number is being typed. | in_1565 in_1562 | click | `Sketch` | later | later |
| K14 | A number typed or a relation added moves the rest of the sketch and not the first-drawn corner (it is held while the solve allows). | in_1565 | | `Sketch` | later | later |

| K15 | The Extrude tool (the ring) waits for a click inside a closed part of the drawing and picks that region (a rectangle with a circle drawn in it is the rectangle with a hole; a click in the circle picks the circle); the view turns about the region to look at the plane from the side. | in_1566 in_034 in_036 | click | `Sketch` | later | later |
| K16 | An arrow stands on the picked region along the plane's normal (the mover's kind of handle, drawn the mover's way); pulling it sets the distance, a ghost of the body (See-through, marked as picked) follows at once, and the number is a bubble at the arrow's tip to type over. Enter, a right click or the check of the operation bar applies; Esc or the cross gives it up; a pull of nothing makes nothing. | in_1566 in_034 in_244 | press, drag, key | `Sketch` | later | later |
| K17 | Applying adds a `sketch` step (the drawing, its plane, the picked region) and an `extrude` step to the recipe; the engine's worker (the kernel, in a Web Worker) makes the body and the screen shows its mesh in the Solid look. A later pull adds a `combine` step: against the plane's direction with a body there, it cuts. | in_1566 in_036 | | `Sketch` | later | later |

| K18 | Undo and redo (Ctrl or Cmd with Z; Shift or Y for redo; round buttons in the step list) go back and forward through everything made, the drawings on the planes and the recipe together, one change at a time, and say what they would undo; a number typed again and again into one bubble or pill is one change; a change after an undo drops the redo. | in_1567 in_026 in_283 | key | `Sketch` | later | later |
| K19 | The step list (top left, hidden until there is a step or something to undo) shows each step of the recipe in order with its status (flagged or orphaned in the engine's words) and its numbers as pills to type over: an extrude's distance, a sketch step's dimensions. The new number is a new recipe the engine makes again; a step that then cannot be made is flagged with the reason and the rest passes through; undo puts it right. | in_1567 in_034 | click, type | `Sketch` | later | later |
| K20 | A sketch is solved with its first corner held (a number or relation moves the far end), by the screen's drawing and by the engine's sketch step alike; and an extrude of no length is flagged in words (the kernel does not come back from one). | in_1565 in_1567 | | `Sketch` | later | later |

| K21 | A click on a body picks what is under the pointer by the names the steps use: an edge when the pointer is within a few pixels of one that can be seen (not one behind the face the pointer is over), else the face; Shift adds edges; a click on nothing, or Esc, puts the pick away. What the pointer is over is marked fainter than what is picked (the Marked look, teal). | in_1568 in_036 | click, hover, escape | `Sketch` | later | later |
| K22 | The helper bar stands beside the pick: for a face, Sketch on this face and Push / pull; for edges, Round and Chamfer; and puts the pick away. | in_1568 in_1562 | click | `Sketch` | later | later |
| K23 | Sketch on a face makes the face's plane the sketch plane (the engine's own frame of the face, so what is drawn lands on it), turns the view straight to it, and an extrude from it is a `sketch` step on the face with the body as its input and a `combine`: out adds a boss, in cuts a pocket. | in_1568 in_036 | | `Sketch` | later | later |
| K24 | Push / pull of a face puts the arrow on the face where it was picked along its outward normal; the face itself, moved, follows the pull; out adds, in cuts; the number is typed over; Enter applies as a `push` step. | in_1568 in_036 in_034 | press, drag | `Sketch` | later | later |
| K25 | Round and Chamfer take the edges picked and one number, the size (about a tenth of the shortest edge to begin with, to type over), applied with Enter as a `round` step; a size of nothing or less makes nothing; what the engine cannot do is flagged in its words. | in_1568 in_258 | key | `Sketch` | later | later |

| K26 | The "..." button (top right) opens a short list: New, Open a file, Save to a file, Export STL, Export STEP; a choice that cannot be made (nothing made yet, no body yet) is dimmed with the reason in its tooltip; a click elsewhere or Esc closes it. | in_1569 in_291 in_294 | click, escape | `Sketch` | later | later |
| K27 | Save gives `model.cad`: the document (the recipe, canonical text) with the drawings on the planes and the planes on faces; Open reads it back (the same recipe makes the same body); a file that is not one, or is newer than the program, is said in words and nothing changes; New clears everything and undo brings it back; Export gives the body as STL (to print) or STEP (to another CAD program) through the engine's worker. | in_1569 in_256 | | `Sketch` | later | later |

| K28 | With no tool on, a press on a point, a line, a circle or an arc and a drag moves it with the solver following the pointer (the part pinned where it goes, soft: it goes as near as the constraints allow); a rectangle stays a rectangle; a locked length holds and what holds a drag back flashes red with a sentence; a press that goes nowhere is a click that picks the part; the whole drag is one change for undo. | in_1570 in_290 in_292 | press, drag | `Sketch` | later | later |
| K29 | A single point dragged and let go on another point joins it (a coincident constraint is added), on a line or circle it is held on it (point on line, point on circle); a cross shows where it will stick while it is dragged. | in_1570 in_294 in_300 | drag | `Sketch` | later | later |

## Contracts
- `Sketch` (`src/interaction/drawing.ts`): what a click does to a sketch's definition, pure, solved by the engine's solver (`engine/definition.ts`, `engine/trim.ts`: no kernel); `src/sketchcontrol.ts` the controller (the host says where each plane is); `src/sketch.ts` the plane's axes to the world.
- `Intents` (`src/input.ts`): `click` with its count, `menu`.
- `ViewState` (`src/view.ts`): `lookAt`, `lookAlong`.
- `Drawing` (`src/world.ts`): `lines`.

## Inputs this section claims
- mouse: left click with a sketch tool on; double click with a sketch tool on; right click with a sketch tool on
- keys: escape ends the figure or the tool
