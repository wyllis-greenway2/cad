# What the prototype's UI does, row by row, and where the rebuild stands

Status: **a draft, `ai-unreviewed`**, for the human to mark up (`in_1572`, `in_1573`). It is a list of what a person sees and does in the old app (`app/src`), written from reading its code and decisions (three read-only passes, each claim checked in the code), so the rebuild can **copy what is pure and polished, recode what decides something, and leave behind what was a workaround** (the human's question after testing: "I like the UI of the prototype much better"). Nothing here is a decision. No tests are written from it until the human has marked it (`in_1444`).

**How to mark it.** In the last column write `keep` (build it as it is), `change` (build it, but like this: say how) or `drop` (not wanted). Rows left blank stay open.

**Rebuild column** (what the rebuild does today, `next/`): **Built** = it does this; **Part** = some of it; **Differs** = it does something else on purpose or by accident, said in the note; **Missing** = nothing yet; **Skip** = a workaround of the old code or a feature outside the rebuild's scope so far (gears, mates, hard bodies, mechanisms, CAM), listed so nothing is lost.
Flags from the old code: **[tuned]** the human corrected or tuned it (a human-input id or a decision says so); **[hack]** an accumulated special case that should not be copied.

Sources are paths under `app/src/`. `ui/` only draws; `interaction/` decides (about 16,600 lines: where the layers of prototyping are).

## 1. Sketch drawing

### 1a. Starting, finishing and leaving a tool
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-1 | Sketch tools: Rectangle, Circle, Polygon, Line, Curve (arc), Spline, Trim; Offset as an operation; all in the ring's Sketch group | control/pointer.ts:60-66,175 | | Part: Line, Rectangle, Circle, Arc, Trim; no Polygon, Spline, Offset | |
| SK-2 | Choosing the same tool again before the first click puts it away | control/modal.ts:101 | | Missing | |
| SK-3 | Starting a tool turns the view straight onto the plane, face or sketch line selected (or under the right click), unless already square | control/modal.ts:83-93 | tuned (in_229) | Built (the plane that is on) | |
| SK-4 | The first click on any surface picks the plane and places the first point (order: chosen plane, plane looked at, selected surface, surface under the click); a block in front of the plane does not take the drawing | control/pointer.ts:503-514 | tuned (in_194) | Missing: draws on the plane that is on only | |
| SK-5 | A first click on nothing drawable says "click on a surface to draw on" | control/pointer.ts:506 | | Missing | |
| SK-6 | Drawing on a body's face makes a plane for it, reused for later sketches on that face | tools.ts:1126-1134 | | Built (face planes by face id) | |
| SK-7 | After a figure the same tool stays armed on the same plane | control/modal.ts:156 | tuned (in_193) | Built | |
| SK-8 | A pill at the top shows the tool icon and a cross (gives up a half-drawn figure, else stops sketching); once a figure exists the cross is a check that flashes green and means "done" | ui/toolchip.ts:95-103 | tuned | Missing for sketch tools (the pill exists for operations) | |
| SK-9 | A tool-icon badge follows the pointer; the cursor is a crosshair | ui/toolcursor.ts | | Part: a cross at the snapped point, no badge | |
| SK-10 | A right click with a tool armed puts it away and opens no menu | control/pointer.ts:833-846 | tuned (in_193) | Built | |
| SK-11 | A right click on a spline with 2 or more points makes it | control/pointer.ts:841-845 | tuned (in_1281) | Missing (no spline) | |
| SK-12 | Enter finishes a figure under way from the clicks plus the typed sizes; with no point placed it puts the tool away | control/modal.ts:286-295 | | Missing | |
| SK-13 | Esc steps out in order (menu, drag-select, picking, operation, tool, preview, sketch mode, adding, selection) | control/modal.ts:386-405 | hack (a long chain) | Part: tool, then selection, then pick | |
| SK-14 | Double click finishes a spline; a click on the first point (10 px) with 3 or more points closes it | control/pointer.ts:553-558 | tuned | Part: double click ends a line chain; clicking the first point reuses it | |
| SK-15 | A line that ends on an existing drawn vertex starts a new line from it at once (chaining); other figures end and the tool stays armed | control/pointer.ts:595-598 | tuned (in_150, in_162) | Differs: a line always chains | |
| SK-16 | With no tool on, a click on a drawn vertex right after a figure re-arms the last tool from it | control/pointer.ts:628-632 | hack | Skip | |
| SK-18 | With a tool armed a click may wander 30 px (22 touch) and still be a click; otherwise 4 px | settings.ts:18 | tuned | Missing | |

### 1b. The tools and how they take clicks
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-19 | Rectangle: two opposite corners; four lines sharing corners, level and upright; the face is selected; a zero-size one is refused in words | tools.ts:1049-1058 | tuned (in_1351) | Part: built; a zero-size one makes nothing, silently | |
| SK-20 | Circle: centre, then a point on the edge; the disk is selected; zero radius refused in words | tools.ts:297-303 | | Part: no words on a zero radius | |
| SK-21 | Polygon: asks for the number of edges (6, 3 to 64); the middle, then the corner-to-corner size, the first corner follows the pointer; equal-length constraints; its middle on a corner or centre joins it | tools.ts:305-317 | tuned (in_1280) | Missing | |
| SK-23 | Line: each click one segment from the last point; an open polyline is allowed; a click on the first point again gives no segment | control/pointer.ts:560-598 | | Built | |
| SK-24 | A line ending on an existing corner reuses it, so loops make a closed shape | tools.ts:1116 | | Built | |
| SK-25 | Arc ("Curve"): three clicks: end one, end two, then the bow (the pointer's distance from the chord, either side) | control/pointer.ts:549-552 | | Differs: centre, start, end (the engine's own arc) | |
| SK-26 | Spline: each click adds a point, the curve runs through them; 3 distinct points at least; a last point on the first makes a closed ring | tools.ts:1090-1112 | tuned | Missing | |
| SK-28 | Trim: a click cuts the part of a line or circle between crossings; the tool stays on; nothing to cut says "click a line or circle where another crosses it" | control/pointer.ts:488-494 | tuned (in_195) | Built | |
| SK-71 | A double click on a selected spline adds a point; on one of its points removes it; fewer than one between the ends refuses in words | control/pointer.ts:744-749 | | Missing | |

### 1c. What is shown while drawing, and typing numbers
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-30 | The live shape follows the pointer (rubber-band rectangle, polygon, circle, line chain, arc, spline) with a small ball at the snapped point | tools.ts:743-790 | | Built (a cross for the ball) | |
| SK-31 | A number chip shows the live size: Width and Height, Diameter, Length, Height of an arc, Edges | entry.ts:56-76 | | Missing | |
| SK-32 | Typing digits, ".", "-" and Backspace edits the active field; Tab switches fields; Enter makes it | tools.ts:242-273 | | Missing | |
| SK-33 | A typed rectangle size keeps the side the pointer is on; a typed line length fixes the end along the pointer's direction; a typed diameter overrides the pointer | tools.ts:283-302,674-683 | | Missing | |
| SK-35 | A typed value turns hints off for the size it fixes | control/pointer.ts:408-420 | | Missing | |
| SK-36 | Before the first click, dashed guide lines run from the pointer to any corner it is level or upright with; dashed so they look unlike geometry | tools.ts:711-731 | tuned (in_381) | Missing | |
| SK-38 | On the centre of a round body edge, a dashed cross through the centre is drawn across the circle | tools.ts:722-730 | tuned (in_1353) | Missing | |
| SK-39 | A circle's centre on another's centre draws dashed cross-hairs across that circle and counts as concentric | tools.ts:732-742 | tuned (in_921) | Missing | |
| SK-40 | Hint icons (one round icon per hint, not clickable) beside the cursor, 16 px right and down | ui/hint.ts | | Missing | |
| SK-41 | The part a hint is about lights amber (also over hover blue and a selected circle's blue) | frame.ts:526; ui/view/highlight.ts:155 | tuned (in_230, in_301) | Missing | |
| SK-42 | While a sketch tool is on, hidden body edges show faintly (0.22; beyond the plane 0.28) | settings.ts theme | tuned (in_324, in_1045) | Missing | |
| SK-43 | Looking straight at the plane, a body between the camera and the plane goes semi-transparent | frame.ts:782-800 | tuned (in_194) | Part: bodies go See-through while a tool is on | |
| SK-44 | Beginning a tool on a body's edge shows the hidden sketch behind it and snaps to it | tools.ts:60-61 | tuned (in_211) | Missing | |

### 1d. Snapping and its cues
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-45 | Snaps to a corner within 12 px; kinds in order: corners, centres of regular polygons and round edges, body corners projected, cut corners, midpoints of straight lines; nearest wins; hidden ones are not snapped | hold.ts:21-52 | tuned | Part: points and curves within 10 px; no midpoints, centres, body corners | |
| SK-46 | Free points round to 0.01 mm; the grid is display-only and does not snap | tools.ts:221-238 | | Differs: points snap to grid crossings within 10 px | |
| SK-47 | Axis alignment: within 6 px of the level or upright line through a corner (also polygon centres, round-edge centres, body corners) the point takes its coordinate | tools.ts:229-237 | tuned (in_381, in_1285, in_1335) | Missing | |
| SK-48 | Midpoint snap: the middle of a straight line, of a body edge, of a flat face as it falls on the plane | hold.ts:45-51 | tuned (in_381) | Missing | |
| SK-49 | On-line / on-circle snap within 12 px (not at the ends of a line); the part lights amber; **it only places the point, no constraint** | hints.ts:56-93 | | Differs: a click on a curve also adds a point-on-line / point-on-circle constraint | |
| SK-50 | A line end takes level or upright within 4 degrees; the same rule for parallel and square to a nearby line and for tangent to a circle or arc | hints.ts:202-224 | tuned | Missing | |
| SK-51 | Tangent snap: a line starting on a circle offers the tangent along the edge; elsewhere it offers the tangents to circles in view | hints.ts:207-224 | | Missing | |
| SK-52 | Equal-length hint: the end snaps to another line's length within 2% | hints.ts:260-268 | | Missing | |
| SK-53 | A line that is level, upright, parallel, square or tangent keeps that direction when reaching another line or circle: the end is where its direction meets it | hints.ts:230-258 | tuned (in_301, in_1374) | Missing | |
| SK-54 | Arc ends snap onto a line or circle; the second end also level or upright with the first; the bow takes the tangent-smooth value within 4 degrees | hints.ts:114-125,290-327 | tuned (in_280, in_381) | Missing | |
| SK-55 | A circle edge being sized snaps to touch another circle (outside, inside, enclosing) within 12 px and shows tangent; a centre placed so the edge is tangent lands there | hints.ts:127-170 | tuned (in_296, in_300) | Missing | |
| SK-56 | A circle's centre on a round body edge or another centre takes that exact centre and counts as concentric | hints.ts:336-355 | tuned (in_308, in_921) | Missing | |
| SK-57 | A second point that would land on the first takes the pointer's own place | control/pointer.ts:536-541 | tuned (in_1351) | Built (makes nothing) | |
| SK-58 | Perpendicular and parallel hints use body edges as they fall on the plane; unseen edges are not offered | hints.ts:63-71 | | Missing | |

### 1e. Constraints made while drawing, typing numbers on parts
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-60 | Hints are shown, **not applied**; the constraint is made only when the person asks (the Constraints list or the suggestion bar) | settings.ts:44; dec_hints_place_only | tuned (in_1328, in_1329) | Part: no hints; the bar offers relations; clicks on curves do add one | |
| SK-61 | The tool's own constraints are applied (level and upright for a rectangle, equal sides for a polygon, shared corners) | tools.ts:1049-1058 | tuned | Built (rectangle) | |
| SK-63 | With a curve selected, corners very near it (8% of its size) are offered "coincident" or "on line"; one click puts them all on it | settings.ts nearFrac | tuned (in_244) | Missing | |
| SK-64 | Typing a number with a part selected sets its own number: side = length, circle = diameter, arc = radius, two sides = angle, two corners = distance; Enter locks it | control/modal.ts:247-258 | tuned (in_235) | Part: D or the bar puts the measured number on, then type over it | |
| SK-65 | An arc has a radius and an arc angle as numbers when selected, with dashed radial lines | dec_arc_angle | | Part: radius only | |

### 1f. Selecting
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-66 | A click selects what is under the pointer (corner, then line, then face or plane; a shape before the face under it); repeated clicks on one spot cycle "i of n here" | control/pointer.ts:813-821 | tuned (in_088) | Part: no cycling | |
| SK-67 | Within 10 px of a corner or 8 px of a line picks it | settings.ts:47 | tuned | Built | |
| SK-68 | Shift or Ctrl/Cmd + click toggles the first thing under the pointer, on or off | selection.ts; input/mouse.ts:41-44 | tuned (in_257) | Built (Shift) | |
| SK-69 | A double click selects the whole body from any part (even a sketch on its face); on a drawn closed figure with no body it turns the view straight to it | control/pointer.ts:777-785 | tuned (in_235, in_1387) | Missing | |
| SK-70 | A triple click selects only that part and turns the view straight to its plane | control/pointer.ts:786-793 | | Missing | |
| SK-72 | Box select: hold still 0.4 s, then drag; left to right takes what is wholly inside (solid outline), right to left also what it touches (dashed); Shift adds, Ctrl/Cmd takes out; edges first, corners only if no edge; hidden parts skipped | boxselect.ts | tuned | Missing | |
| SK-73 | Left and right buttons together start a rectangle at once; a finger has Drag select in the ring | input/mouse.ts:28-33 | tuned (in_1281) | Missing | |
| SK-74 | A click on blank space lets go of everything | control/pointer.ts:754-760 | | Built | |

### 1g. Dragging
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-75 | Dragging a drawn corner moves it through the solver, with the same snaps and hints as drawing; one undo step | control/handles.ts:384-420 | tuned (in_290) | Part: solver follows; snaps to points and curves only | |
| SK-76 | Dragging a line moves it whole; an end near another line or circle lands on it; a vertex near the line is put on it | control/handles.ts:454-502 | tuned (in_290, in_294) | Built | |
| SK-77 | An arc drags whole with its centre, keeping its size | control/handles.ts:481-501 | tuned (in_292) | Built | |
| SK-78 | Dragging a circle's edge changes its radius (min 0.1 mm); near a size that touches another circle it snaps there | control/handles.ts:503-532 | tuned (in_290, in_294) | Missing (a circle drag moves its centre) | |
| SK-79 | A locked diameter refuses in words ("unlock it to change the size"); a fixed point refuses in words ("remove the lock to move it") | control/handles.ts:435-436,508 | tuned (in_290) | Part: red flash and a general sentence | |
| SK-80 | A point the constraints will not release exactly slides to the nearest allowed place; one held in place is refused with the reason | control/handles.ts:430-440 | hack | Built (soft pins) | |
| SK-81 | A point of a selected spline drags and the curve follows; pressing a corner or edge with no tool on drags it instead of orbiting | control/handles.ts:355-382 | | Part (no spline) | |
| SK-82 | A drag from empty space orbits | control/handles.ts:320-352 | tuned | Built | |

### 1h. Editing: trim, offset, mirror, repeat, copy, delete
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-83 | Trim previews only the part that would go, in the selected blue, as the pointer hovers; nothing shows where nothing crosses | control/pointer.ts:377,411-420 | tuned (in_206) | Built (in red) | |
| SK-84 | Trim keeps tangent and on-circle constraints on the pieces, carries a circle's diameter to an arc radius, drops others of the whole part | operation/trim.ts:60-75 | tuned (in_229) | Built (and says what it let go) | |
| SK-85 | Offset: drag or type on a selected figure: a closed figure (a rectangle stays one), circle, line, chain, body edges or a face; out positive, in negative | offset.ts:195-262 | tuned (in_177, in_244) | Missing | |
| SK-86 | Several enclosed sketches offset together; the arrow stands on the one nearest the click | offset.ts:28-60 | tuned (in_1374) | Missing | |
| SK-87 | Mirror: the mover's three axis arrows each end at a plane; pull or type moves it; a click on a line or face sets the plane there | mirror.ts | tuned (in_433, in_437, in_1322) | Missing | |
| SK-89 | Linear and circular repeat, path repeat of a figure with its relations; numbers in bubbles; Enter or a right click applies | pattern.ts | | Missing | |
| SK-90 | Ctrl+C / Ctrl+V copy and paste, beside the original or on the selected surface | paste.ts | tuned (in_435) | Missing | |
| SK-91 | Delete removes the selected parts; a closed figure goes with its corners and its constraints; undo restores both | actions.ts:289-310 | | Built | |
| SK-92 | A drawn corner exists only while something stands on it: none are left behind by a delete or trim | dec_no_stray_corners | tuned (in_363-365) | Built | |
| SK-93 | Delete of a sketch surface cut by crossing curves trims only its own edges; refused when a step uses it | actions.ts:291-300 | tuned (in_285) | Missing | |
| SK-94 | Delete is one ring item; Undo and Redo are the top rows of the ⋯ list | dec_chord_and_trash | tuned (in_1281) | Part: bar button and key; round buttons for undo | |

### 1i. The sketch plane and the view
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-95 | A tool begun on a plane cuts the view along it until Exit sketch; only what existed when it began is cut | control/section.ts:107-125 | tuned (in_1374, in_1375, in_1385) | Part: placed planes cut; world planes do not; face planes do not | |
| SK-96 | The cut follows the plane the tool is on; an eye icon toggles it; remembered across planes | control/modal.ts:465-468 | tuned (in_1377, in_1378) | Missing | |
| SK-97 | The ring's pencil begins sketch mode at once: square to the plane right-clicked (or selected), cut along it, and opens the tools; no plane says "select a plane or a face, or right-click on one" | control/modal.ts:455-463 | tuned (in_1385, in_1387) | Part: the pencil opens the tools only | |
| SK-98 | "Exit sketch" leaves sketch mode (cut and tool go); Esc leaves it when nothing else is open | control/controller.ts:194 | tuned (in_1375) | Missing | |
| SK-99 | X, Y and Z only turn the view onto the world plane; they do not leave sketch mode | control/viewing.ts:94 | tuned (in_1385) | Built | |
| SK-100 | "Keep square" holds the view normal to the sketch plane (no orbiting; pan and zoom still work) | control/viewing.ts:14-19 | tuned (in_1385) | Missing | |
| SK-101 | Looking straight at a plane is orthographic; leaving needs a 60 px drag, then perspective returns smoothly (350 ms) | control/viewing.ts:38-47 | tuned (in_193) | Built | |
| SK-102 | N looks straight at the selected plane; repeated, front and back (seen mirrored from the back) | control/viewing.ts:83-86 | | Missing | |
| SK-103 | The faint grid shows on the plane looked at, finer as you zoom (about 30 divisions); a fading patch from the side | grid.ts | tuned | Built | |
| SK-104 | Closed sketches of zero thickness show a faint see-through tint (0.06; 0.28 on hover) | settings.ts theme | tuned (in_194) | Missing | |

### 1j. Touch (sketching)
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| SK-105 | First tap sets the first point; the next is already held 90 px right, 70 px up (an arc's bow 50 px aside) | control/pointer.ts:427-456 | tuned (in_286, in_288) | Missing | |
| SK-106 | Each placed point has a finger-drag icon joined by a dotted line; a tap elsewhere sets the held point; a figure finished by a tap ends the tool | control/pointer.ts:427-440 | tuned (in_288, in_289) | Missing | |
| SK-107 | A tap in free space with Trim on puts the scissors away; a tap over a part cuts it | control/pointer.ts:432-436 | tuned (in_292) | Missing | |
| SK-108 | A long press (450 ms) is a right click | settings.ts longPressMs | tuned (in_283) | Missing | |
| SK-109 | Undo and redo in a bottom bar for a finger | ui/toolchip.ts:22-26 | tuned (in_286) | Missing | |
| SK-110 | Wider multi-tap limits for touch (28 px, 550 ms) | settings.ts:22-37 | | Missing | |

## 2. Constraints and dimensions in a sketch

### 2a. Where bubbles sit and when they show
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-1 | A constraint is a small white pill ON its part: a line's middle (level, upright, length), a corner (fixed, coincident), a circle's centre (diameter, concentric) | annotations.ts:103-176 | tuned (in_058-061, in_118) | Built | |
| CN-2 | Between two lines: Parallel and Equal midway; Perpendicular where the lines would meet; an angle at the middle of a small arc drawn between them | annotations.ts:121-141 | tuned (in_118) | Part: at the middle of the parts' places | |
| CN-3 | Between two corners a distance sits at the midpoint and draws the measured segment; corner to line draws the foot; line to line midpoint to foot | annotations.ts:107-147 | | Missing (no measure line) | |
| CN-4 | Tangent sits at the contact (the foot of the centre on the line, the touch point between two circles) | annotations.ts:148-174 | | Part | |
| CN-5 | Bubbles show only for what is selected; a face, plane or world plane shows none | annotations.ts:248 | tuned (in_118) | Built | |
| CN-6 | One selected line, circle or corner shows every constraint that touches it or its end points or centre | annotations.ts:250-263 | tuned (in_195) | Part: constraints that name the selected part only | |
| CN-7 | Two selected parts show only the constraints that join the two; more than two show none (box select does not flood the screen) | annotations.ts:259-263 | tuned (in_1332) | Differs: all that touch any selected part | |
| CN-8 | A number the selection could be given appears as a measured bubble (length, diameter, radius, angle, distance); hidden once a locked one exists | annotations.ts:309-325 | | Missing (the bar offers it, no bubble) | |
| CN-9 | A selected arc shows its angle ("∠") with dashed lines from its centre; typable | annotations.ts:218-245 | tuned (in_463) | Missing | |
| CN-11 | Once a sketch has made a body, structural constraints (coincident, on-line, on-circle, arc ends inside the profile) are hidden; dimensions, tangent, perpendicular, parallel, level, upright, equal stay | annotations.ts:247; dec_hide_structural_constraints | tuned (in_238-243) | Missing (all are shown) | |
| CN-12 | A refused edit still flashes the hidden relations that refused it | annotations.ts:303-306 | | Built (flash shows the bubbles) | |
| CN-13 | "All constraints" in the ⋯ View menu shows every constraint of the world whatever is selected | appmenu.ts:31 | tuned (in_1157) | Missing | |
| CN-14 | A lock icon in the bar shows every constraint that touches a double-clicked body | bar.ts:54-61 | tuned (in_1157, in_1160) | Skip for now (needs bodies' mates) | |

### 2b. Bubble layout and avoiding each other
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-16 | A bubble stands 14 px right and 24 px up of its spot; keeps off lines, corners and other bubbles; rings of 28, 48, 72 px at 8 angles when blocked | bubbleplace.ts | tuned (in_259, in_260) | Built (ported unchanged) | |
| CN-17 | A bubble keeps its place while clear (no hopping as the camera turns); slides, easing 40% per frame | bubbleplace.ts:3,69-79; ui/bubbles.ts:149-155 | tuned (in_259) | Part: keeps its place; no easing | |
| CN-18 | A bubble that gave way goes back only after 10 clear frames | bubbleplace.ts:23 | tuned (in_264) | Built | |
| CN-19 | Bubbles within 34 px are laid side by side in a row, 4 px apart | bubbleplace.ts:6 | tuned | Built | |
| CN-20 | Front to back: ring and menus, typed-number bubbles, helper bubble and suggestion bar, constraint bubbles, hint icons; each gives way to those in front | main.ts:806,818; dec_bubble_layout | tuned (in_260-264) | Part: the helper bar and ring; not number chips | |
| CN-21 | With no clear place within 70 px a bubble under something in front fades to 30% and takes no clicks until it clears | ui/bubbles.ts:167-168 | tuned (in_260) | Built | |
| CN-22 | A bubble moved more than 44 px from its spot gets a thin grey line back to it | ui/bubbles.ts:170-181 | tuned (in_260) | Missing | |

### 2c. Open, hover, delete
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-25 | Clicking a bubble opens it (edge amber); again closes; one open at a time | ui/bubbles.ts:43,126 | tuned (in_118) | Part: several can be open | |
| CN-26 | An open bubble shows a cross ("Delete this constraint") that deletes it | ui/bubbles.ts:72-80 | tuned (in_061) | Built | |
| CN-27 | Hovering a bubble also shows its cross and raises it above neighbours | ui/bubbles.ts:127-128 | tuned | Missing | |
| CN-28 | While a bubble is open, every part it ties lights amber (a Parallel bubble shows the line it is parallel to) | annotations.ts:357-360; ui/view/highlight.ts:34 | tuned (in_061, in_1129) | Missing | |
| CN-29 | The tooltip carries the constraint's name, number, "(locked)" or "(measured…)", and ": a part it used is gone" | ui/bubbles.ts:42 | | Part | |
| CN-30 | A constraint whose parts are gone has a red edge | ui/bubbles.ts:43 | | Missing (the engine removes them with the part) | |
| CN-33 | Deleting a part flashes the surviving parts red; orphaned constraints' bubbles swell to 1.7x and fade | controller.ts:131-132; ui/bubbles.ts:160-167 | tuned (in_1168) | Missing | |

### 2d. Dimension bubbles
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-34 | A dimension is just its number and a small lock, no box, no label | ui/bubbles.ts:48-66 | tuned (in_118) | Differs: a white pill with the number, no lock | |
| CN-35 | Locked = closed padlock in teal; measured-only = open padlock at 80%; clicking locks at the number it measures now, again unlocks it back to a live measurement | ui/bubbles.ts:61-65 | tuned (in_290) | Missing (a dimension is always locked; no measured-only state) | |
| CN-37 | Click the number: an input (Enter keeps, Esc or clicking away restores, a refused value leaves the old number) | ui/bubbles.ts:54-57,84-110 | tuned (in_118) | Built | |
| CN-38 | A typed value must be finite and above 0 (a mate may take 0); no range UI; angle limits are the solver's | ui/bubbles.ts:101 | | Built | |
| CN-39 | A typed number that would break others flashes the refusal | control/modal.ts:702 | | Built | |
| CN-40 | Units follow the app-wide number system (mm or inches), no unit text; typed values converted back | ui/bubbles.ts:9; shared/units.ts | tuned (in_661) | Missing (mm only) | |
| CN-41 | Angles always carry the degree mark | ui/bubbles.ts:59 | tuned (in_434) | Built | |
| CN-42 | A diameter shows "Ø", an arc radius "R", an arc angle "∠", the symbol dimmed | annotations.ts:190 | | Part: R and ° only | |
| CN-44 | Numbers a body edge cannot take stay read-only (no cursor, no lock) | annotations.ts:192-215 | | Missing (no body-edge numbers) | |
| CN-46 | Typing digits with a drawn part selected opens the Dimension chip (see SK-64) | control/modal.ts:245-258 | tuned (in_235) | Missing | |

### 2e. The suggestion bar
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-48 | Selecting one or two parts pops a rounded row of round 28 px buttons: the selection's own icons LEFT; suggested constraints RIGHT in a dashed teal outline; a thin separator | ui/suggest.ts:14-27,96; bar.ts:41-67 | tuned (in_195, in_1160, in_1177) | Part: same layout; no dashed outline | |
| CN-49 | Right side order: constraints that fit and are not yet made; up to 2 "near" suggestions; Select similar; Group; Ungroup | interaction/suggest.ts:26-34 | tuned (in_268, in_381) | Part: relations only, numbers first | |
| CN-50 | Only geometric, non-dimension relations are suggested (numbers are asked on bubbles); order Horizontal, Vertical, Fix in place, On line, On circle, Coincident, Same height, Same position across, Tangent, Equal length, Parallel, Perpendicular | interaction/rows.ts:58-135 | | Differs: dimensions are offered first; order is the relations table's | |
| CN-51 | "Near" suggestions: a corner or centre close to a curve it is not on offers "On line" or "On the circle"; a curve offers one that puts all near corners on it; nearly touching circles offer Tangent; near-concentric offers Concentric; at most 2 | interaction/suggest.ts:120-227 | tuned (in_244, in_290, in_292) | Missing | |
| CN-52 | Body edges and circular edges in the plane count as targets for near suggestions (read-only) | interaction/suggest.ts:140-224 | tuned (in_308, in_310-312) | Missing | |
| CN-54 | "Fix in place" offered with an open padlock; once made, a closed padlock bubble | ui/suggest.ts:77 | tuned (in_290) | Part: offered; no padlock icon | |
| CN-55 | A new button fades in (0.25 s); a pressed one pops 1.4x then settles (260 ms); an applied one fades and shrinks | ui/suggest.ts:10,78-92 | tuned (in_1177) | Missing | |
| CN-56 | The row stands below the selection (67 px below its middle, 6 px left); with only the bar, 45 px above the body | ui/suggest.ts:99-103 | tuned (in_1345) | Differs: up and to the right of the selection | |
| CN-57 | When it first opens it keeps off the pointer (a box around it); once open it stays put so it can be hovered and clicked | ui/suggest.ts:42,100 | tuned (in_1345) | Missing | |

### 2f. Refusals, already-holding, conflicts
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-60 | Any attempt to break a constraint (drag, number, tool, push/pull, move, mate) always does the same: the blocking constraints flash red, the culprit bubble shakes, a button appears beside the first red bubble | inv_constraint_uniformity; session.ts:256-267 | tuned (in_366, in_436, in_1086) | Part: red flash of the bubbles and a sentence; no shake, no button | |
| CN-61 | No sentence: the button reads "Delete constraint to proceed" ("constraints" for several) beside the red bubble | frame.ts:544; ui/notices.ts:98-104 | tuned (in_1199) | Missing | |
| CN-62 | Pressing it deletes the blockers and makes the change as one history step; one undo takes both back | controller.ts:119-135 | tuned (in_366) | Missing | |
| CN-63 | The flash lasts 4.5 s, red fading from the start; the culprit shakes 450 ms (7 px, 3 cycles); held while the pointer is on the button | settings.ts:86; ui/bubbles.ts:159-163 | tuned (in_366) | Part: 1.8 s flash, no shake | |
| CN-64 | The parts a refused constraint ties flash red with its bubble (edges, vertices, faces, surfaces, red tint 50%) | ui/view/highlight.ts:35,180-208 | tuned (in_434, in_436) | Missing (only the bubbles) | |
| CN-65 | A refused drag held back by a constraint shows red while held, then snaps back | frame.ts:268,502 | tuned (in_1173) | Part | |
| CN-66 | A constraint that already holds adds nothing; the bubble and parts flash a mild green and the status says "that already holds…" | session.ts:162-176 | tuned (in_1103, in_1111) | Part: said in words, no green flash | |
| CN-69 | Sides the constraints would shrink to zero are refused as a conflict; Horizontal and Vertical are greyed for a line that has the other | solve.ts:308-318; rows.ts:60-61 | tuned (in_254) | Part: refused by the solver; not greyed | |
| CN-70 | The status line says what could not be made after an edit; redundant constraints get no message | session.ts:286-297 | | Built (same) | |

### 2g. Colour and weight of sketch parts
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-72 | **No** fully / under / over-constrained colouring: selected is teal, hover a teal disc, amber = tied by the open constraint or a hint, red and green are flashes only, pulsing blue = temporary repeat copies | ui/view/highlight.ts:33-37 | | Built (the same: none) | |
| CN-73 | Line weights: selected 2.4 px, hovered 1.8, flash lines 3.4; a selected corner a ball at 1.25x | settings.ts:47 | tuned (in_075) | Part | |
| CN-74 | Constraint notes in charcoal 1.6 px (angle arc, measured segment); the arc's centre dashes 1.4 px | ui/view.ts:321-329 | | Missing | |
| CN-75 | A closed sketch under the pointer fills teal with a ring; at rest a 6% see-through tint | ui/view/highlight.ts:191-195 | tuned (in_194) | Missing | |

### 2h. Hints while drawing or dragging
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-76 | Small round teal icons (26 px, not clickable) beside the end while a line, arc, circle or rectangle is drawn or a corner is dragged, one per hint taken | ui/hint.ts | tuned (in_152) | Missing | |
| CN-77 | Hint kinds: horizontal, vertical, parallel, perpendicular, on line, on circle, concentric, tangent, equal length (4 degrees; nearest wins) | hints.ts:178-243 | tuned (in_152) | Missing | |
| CN-78 | The end snaps onto a line or circle within 12 px, not in the first or last 2% of a line | hints.ts:84-118 | | Missing | |
| CN-80 | Alignment guides while drawing are dashed teal lines at 1.5 px | ui/view.ts:313 | tuned (in_381) | Missing | |
| CN-82 | Taking a hint only places the point and shows the guide; a switch restores the old make-constraint behaviour | dec_hints_place_only | tuned (in_1328, in_1329) | Part (see SK-60) | |
| CN-83 | Snapping a line end onto an existing corner reuses it (not a constraint) | hints.ts:185 | | Built | |
| CN-84 | A rectangle drawn from another figure's corner, a circle centred on a corner, a trim that makes a corner where another is: a coincident is added (hidden) | dec_hide_structural_constraints | tuned (in_240, in_243) | Built (shared points) | |

### 2i. The constraint ring, menus, keys, touch
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| CN-86 | The ring's "Constraints" category is one flat list: Horizontal, Vertical, Parallel, Perpendicular, Angle, Coincident, On, Tangent, Concentric, Equal, Dimension, Fix (then Hard body, Fixed body) | constraintlist.ts:14-27 | tuned (in_666, in_975) | Missing (the bar only) | |
| CN-87 | Each entry stands for several kinds; the first enabled action for the selection is made | constraintlist.ts:29-33 | tuned (in_975) | Missing | |
| CN-88 | An entry the selection does not fit stays visible but dimmed (38%); pressing says what to select; the ring never changes shape | control/pointer.ts:258 | tuned (in_661, in_666) | Missing | |
| CN-89 | Ring layout: round 36 px buttons on a circle starting at the top; sub-rings unfold over 280 ms, 22 ms apart; the parent becomes a red cross "Back"; kept on screen | ui/ring.ts | tuned (in_133, in_143) | Built (ported) | |
| CN-90 | The first-selected part moves to meet the second when a pair constraint is applied | actions.ts:80-90 | tuned (in_229, in_1109) | Built | |
| CN-91 | The ring holds Delete; with nothing selected it deletes what the right click was over | control/pointer.ts:263-272 | tuned (in_1281) | Missing | |
| CN-92 | No per-constraint keyboard shortcuts; digits are the keyboard route to a dimension | settings.ts:38-42 | | Part: D | |
| CN-93 | The Settings page rebinds keys | ui/settings.ts:55 | tuned (in_661) | Missing | |
| CN-94 | Touch: a long press is a right click; a 450 ms press on a button shows its tooltip; the finger's drag icons get the same hints; bubbles keep off drag icons; a finger taps into the number bubble to type | tips.ts; dec_touch_sketching | tuned (in_288-292, in_300) | Missing | |

## 3. Modeling (the 3D side)

### 3a. Mouse, touch, keys
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-1 | A left click selects; a right click without movement opens the ring; right-drag, Alt+left-drag and left-drag on empty space orbit; middle-drag, Shift+right-drag, Space+drag pan | input/mouse.ts:1-18,44-47 | tuned (in_235) | Built | |
| MD-2 | Click counts: one selects the part; two the whole body from any part; three only that face and turns the view square to it; two on a flat sketch or world plane turns square to it | control/pointer.ts:773-830 | tuned (in_235, in_1387) | Missing (one click only) | |
| MD-3 | Repeated clicks on overlapping things cycle ("2 of 4 here"); order: corners, lines and circles, faces and planes, nearest first | session.ts:382-390; picking.ts | | Missing | |
| MD-4 | Keys: Ctrl/Cmd+Z undo, Shift+Ctrl+Z or Ctrl+Y redo, Esc, Delete or Backspace, Ctrl+G group, Ctrl+Shift+G ungroup, Ctrl+C, Ctrl+V; **no letter keys for tools** (mapped in code, never bound); digits and Tab and Enter go to typed numbers | settings.ts:38-42; input/keys.ts | hack (unused actions) | Part: undo, redo, delete, Esc | |
| MD-5 | Touch: one finger orbits, two pan and pinch; tap, double tap, triple tap are the clicks; a long press opens the ring | input/touch.ts | | Part: the camera's touch is built; the ring and taps are not | |
| MD-6 | On touch, each handle and point shows a round drag icon with a dotted line; a tap elsewhere applies | input/touch.ts:17-100 | tuned (in_284, in_285) | Missing | |

### 3b. The ring, the ⋯ menu
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-9 | Top-level ring: Sketch, Constraints, Models (gear icon), Move, Repeat, Select, Shape (body icon), a Cross-section eye, one Delete bubble | control/pointer.ts:174-181 | | Part: Sketch (tools), Extrude, Sketch plane | |
| MD-10 | Sketch holds Rectangle, Circle, Polygon, Line, Curve, Spline, Trim, Offset; Shape holds Push pull, Fillet chamfer, Hollow, Revolve, Loft, Sweep, Scale, Boolean and Fabricate sub-rings | control/pointer.ts:175-176 | | Part (see 1a) | |
| MD-11 | Boolean: Add, Subtract, Intersect, Parts; Move: Move, Rotate, motion items; Repeat: Copy, Paste, Mirror copy, Line, Round, Path repeat; Select: Add mode, Drag select, Select similar, All bodies/faces/edges/vertices, Group, Ungroup | control/pointer.ts:175-180 | | Missing | |
| MD-12 | A bubble with children unfolds a new ring from it, staggered over 280 ms; the parent turns into a red cross "Back" | ui/ring.ts:7-15,61-84 | tuned | Built | |
| MD-13 | The "gear menu": the Models ring is gear-icon; each tool opens a labelled number box on the left; Edit/Helix/Mesh on the small gear icon on a selected gear | ui/gearbox.ts; interaction/frame.ts:159 | tuned (in_685, in_771) | Skip for now (gear parts) | |
| MD-14 | Every category always opens; when nothing inside applies it is only dimmed | control/pointer.ts:184-187 | tuned (in_538) | Missing | |
| MD-15 | Tooltips are one or two words; a dimmed bubble pressed says why in the status line and the ring stays open | ui/ring.ts:46,50 | tuned (in_538, in_541) | Part | |
| MD-16 | Choosing an operation with nothing selected waits ("picking"), says what to click, shows check and cross; only usable things light up on hover | control/pointer.ts:616-630 | tuned (in_464, in_465) | Missing | |
| MD-17 | Pressing a dimmed item whose reason is "select X" steps the menu aside, says "Select X: click it (Esc to leave)", and runs by itself once the selection fits | control/modal.ts:449-454 | tuned (in_951) | Missing | |
| MD-18 | Subtract is two-step: click the bodies to cut, Enter, click the cutters, Enter; Add and Intersect use the selection or all bodies | control/select.ts:135-170 | tuned (in_1333, in_1337) | Missing (the engine has combine) | |
| MD-19 | Undo and Redo are rows at the top of the ⋯ list | appmenu.ts:5-6 | tuned (in_1281) | Differs: round buttons in the step list | |
| MD-20 | The ⋯ list: Undo, Redo, Bodies, History, Groups, Import, Export, View, Fabricate, Clear cache, Settings, Build | appmenu.ts:4-34; ui/controls.ts | tuned (in_541, in_1083) | Part: New, Open, Save, Export STL, Export STEP | |
| MD-21 | View sub-list: Look at, Game mode, Hide body, Wireframe or Solid, All constraints, Show cuts, Tape measure | appmenu.ts:26-34 | | Missing | |
| MD-22 | The eye bubble puts a cross-section plane on the selection; the pencil enters sketch mode (square to the plane, cut along it); the eye then toggles the cut | control/modal.ts:456-476 | tuned (in_1387) | Missing | |
| MD-24 | Game mode: the ring opens at the middle, the mouse is a small stick that lights one option, the view tilts toward it, a click chooses; a right click closes | ui/ring.ts:26-40,110-140; dec_game_menu_in_space | tuned (in_463-518) | Part: game mode and ring exist; the stick is not ported | |
| MD-25 | The Constraints ring never changes shape; entries dimmed with "select X first" | control/pointer.ts:258-263 | tuned (in_975) | Missing | |

### 3c. The operation bar
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-26 | A dark pill top centre: icon, words, option buttons, a check and a cross; on a finger it moves to the bottom with undo and redo | ui/toolchip.ts | tuned (in_664, in_286) | Part: icon-less, words, check, cross; no options; no touch form | |
| MD-27 | Apply with Enter, a right click or the check (a touch tap away from handles also applies); cancel with Esc or the cross, which takes back every step it made | control/modal.ts:386-441 | tuned (in_244) | Built | |
| MD-29 | Options in the pill: Face kind (Move, Extrude, Extend), Size kind (Constant, Variable, Two distances, Swap faces), Loft, Sweep, Cut parts, Select-similar rules; Tab and Shift+Tab step through; Shift+Enter flips a switch | options.ts | tuned (in_664, in_405, in_406, in_670) | Missing | |
| MD-30 | While nothing is typed, Arrow Up and Down change the live value by 0.1 mm | operations.ts:627-638 | | Missing | |
| MD-31 | A number bubble at the arrow tip shows the live value while dragging; a typed number replaces the drag; the step is made on release, later drags replace it | ui/chip.ts; operations.ts:660-668 | tuned (in_124, in_127) | Part: bubble and typing built; the step is made on apply | |
| MD-32 | With a handle showing for the selection, typing digits starts that operation with that number (10 on a selected sketch face extrudes 10) | control/modal.ts:242-258 | tuned (in_235) | Missing | |
| MD-33 | Undo steps back one history step; an open operation that made nothing is put away by the first undo | control/modal.ts:669-675 | hack (settle loop) | Built | |

### 3d. Selecting on bodies, hover, the helper bar
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-34 | Pointing at a surface lays a flat see-through disc (0.14) at the pointer; a click spreads teal (0.25) over the face from the click in about 520 ms; selected edges are teal lines, corners balls | ui/orb.ts; ui/view/highlight.ts; settings.ts:48-58 | tuned (in_073-075, in_300) | Part: faces and edges marked teal (hover and pick); no disc on bodies, no spread | |
| MD-35 | Shift+click adds or removes; Ctrl/Cmd+click adds; a click on a member of a selected group goes one level in | input/mouse.ts:37,48 | | Part: Shift adds edges | |
| MD-36 | Shift+click on whole bodies adds or removes the whole body | control/pointer.ts:820-826 | tuned (in_291) | Missing | |
| MD-38 | Box select on the 3D side (as SK-72), edges first, hidden skipped | input/mouse.ts; boxselect.ts | tuned (in_235, in_1281) | Missing | |
| MD-39 | Select similar by Kind, Size, Angle (Direction off); chips in the bar toggle each rule; "Select similar (N more)" offered after two like things | similar.ts; control/select.ts:20-89 | tuned (in_257, in_268, in_381) | Missing | |
| MD-40 | All faces, All edges, All vertices, All bodies from the selection; they say what was selected or why nothing | control/select.ts:31-77 | tuned (in_393, in_435, in_538) | Missing | |
| MD-41 | Add mode (touch): every tap adds or removes; a pill "Adding: tap to add or remove · Done" | ui/addchip.ts | tuned (in_539, in_540) | Missing | |
| MD-42 | Group and Ungroup: selecting any part selects the group | control/select.ts:91-116 | | Missing | |
| MD-43 | The helper bar by the selection: left, the selection's own icons (body eye, play, constraint lock, sheet icons, gear, cut both ways); right in a dashed outline, suggested constraints and mates; slides out of the pointer's way | ui/suggest.ts; bar.ts | tuned (in_195, in_1160, in_1177, in_264) | Part: left delete and put-away; right the face or edge actions or the relations | |
| MD-44 | A hidden body cannot be picked; over its outline a bar with only an eye appears and brings it back | ui/bodychips.ts | tuned (dec_hidden_bodies) | Missing | |
| MD-45 | Overlapping bubbles: the one behind slides (70 px) then fades; a leader line joins one moved far; the ring and typed number never move | bubbleplace.ts; dec_bubble_layout | tuned (in_259, in_260) | Part (no leader line) | |

### 3e. Extrude, push/pull, handles
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-46 | A selected closed sketch shows a double arrow normal to it; a selected flat face a push/pull arrow; selected edges a fillet arrow; a whole body XYZ arrows; all appear by themselves | operations.ts:564-579; gizmo.ts:176-181 | tuned (in_135) | Differs: arrows only after the tool or the bar's button; one-way arrow | |
| MD-47 | Dragging the arrow out adds, in subtracts (stored once as new body, add or cut; not flipped by a later replay) | operations.ts:318-326; runop.ts:94-100 | tuned (in_295, in_270) | Built | |
| MD-48 | While you drag, the real result is drawn from the kernel for the size under the pointer (rough mesh, newest request wins); fine faces on release; a figure apart from bodies previews without the boolean | frame.ts:432-450; dec_drag_preview_without_kernel | tuned (in_362, in_1064) | Differs: a ghost prism or face; the engine runs on apply | |
| MD-49 | A size the kernel cannot make leaves the old picture and says why; zero or less says so | frame.ts:445-451; runop.ts:71-79 | | Part: said after apply | |
| MD-50 | A cut can go both ways from its plane (a both-ways button when the cut's ghost is selected) | bar.ts:60 | tuned (in_1348) | Missing | |
| MD-51 | Show cuts draws each cut's tool as a red translucent ghost body; a click selects the cut's figure; the cut is remade where it now stands | control/pointer.ts:637-652; dec_cut_tools | tuned | Missing | |
| MD-52 | Push/pull of a flat face has Move (changes the step that made it), Extrude (adds or takes a prism) and Extend (neighbours carried on until they meet); several faces have no Move | options.ts:19-30 | tuned (in_405, in_410) | Differs: one kind: a prism added or cut | |
| MD-53 | Push/pull on a round wall changes the circle's radius (bubble shows diameter); on a fillet or chamfer face changes that step's size; else "this curved face can be selected but not pushed or pulled yet" | operations.ts:412-455 | | Missing | |

### 3f. Fillet, chamfer, hollow, offset
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-55 | A fillet or chamfer needs lines or flat faces; selecting a face rounds all its edges; the size arrow stands on the last-selected edge; one pull sizes all | operations.ts:470-500; gizmo.ts:210-213 | tuned (in_135, in_257) | Part: edges (Shift for several); a typed number, no arrow; faces not rounded whole | |
| MD-56 | Dragging one way gives a fillet, the other a chamfer; the step reads "Fillet 2 mm" or "Chamfer 2 mm" | panels.ts:37 | | Differs: two buttons; the step list reads Round or Chamfer | |
| MD-57 | Variable size: start and end sizes (Tab between), mid, quarter, three-quarter; round rims around the rim | options.ts:33-47; operations.ts:577-603 | tuned (in_406, in_410) | Missing (the engine takes a size law) | |
| MD-58 | Chamfer "Two distances" with Tab between and "Swap faces" | options.ts:41-45 | tuned | Missing | |
| MD-60 | Hollow: the whole body selected, the arrow goes in; flat faces selected are left open; a switch swaps keep and open; failures said in words | operations.ts:289-309 | tuned (in_391-394) | Missing | |
| MD-61 | Offset copies a closed figure, circle, line, chain, or a flat face's edges or face; nothing fitting says what to select | operations.ts:311-316 | | Missing | |

### 3g. Sketch on a face or plane
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-62 | Choosing a sketch tool (or the pencil) turns the view square to the plane or face selected, starts sketch mode, cuts the view along it; "Exit sketch" leaves | control/modal.ts:456-476; ui/toolchip.ts:26-36 | tuned (in_1375, 1376, 1385) | Part: turns square; no mode, no exit | |
| MD-63 | While sketching the pill has a Cut view button and a "keep square" button (teal when on) | ui/toolchip.ts:30-35 | tuned (in_1377, in_1385) | Missing | |
| MD-64 | A world plane under the pointer only takes the drawing when nothing else is under it; looking square hides what lies between plane and camera | picking.ts:21-76 | tuned (in_190, in_194) | Missing | |

### 3h. The mover, copy, repeat, mirror, and other operations
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-66 | Move: three arrows with a bubble at each tip; Rotate: three rings; a blue orb at the junction; a swapper switches; a pose set in orient mode is remembered per selection | gizmo.ts:135-145; ui/modeswitch.ts | tuned (in_206, in_439) | Part: the orb moves and orients a placed sketch plane, not bodies | |
| MD-67 | Clicking an arrow selects it and shows its number; a click on a move arrow holds the drag to that axis; Shift adds a second axis (a plane); panes hold the drag to their plane | control/pointer.ts:722-748 | tuned (in_1181) | Part | |
| MD-68 | Pressing a whole selected body and dragging moves it freely on the camera-facing plane; one move step on release; several bodies together; with mates it goes where they leave it | control/handles.ts:274-335 | tuned (in_291, in_345, in_366) | Missing | |
| MD-69 | Orient mode: click the blue orb; the body goes wireframe; arrows move the orb, rings turn its axes; a click on a corner, edge or face puts the mover there; Esc restores | control/pointer.ts:689-721 | tuned (in_416-439) | Part (sketch plane only) | |
| MD-70 | Scale: an arrow per axis, a diagonal for uniform, panes; refuses without a body | gizmo.ts:248-262 | tuned (in_387, in_390) | Missing | |
| MD-71 | Copy, Linear and Circular repeat share one open repeat (arrows for spacing, a short arrow for count, rings and a pivot orb); copies preview soft blue; reopen from History | pattern.ts; control/modal.ts:800-890 | tuned (in_141-384) | Missing | |
| MD-72 | Copy and paste of bodies | control/modal.ts:758-798 | tuned (in_386, in_435) | Missing | |
| MD-73 | Mirror copy of a body (plane arrows, click a line or face to put the plane) | gizmo.ts:187-198 | tuned (in_437, in_1322) | Missing | |
| MD-74 | Revolve: select a closed figure (and a line); orb, rings, arrows; Tab switches angle and advance | revolve.ts; gizmo.ts:219-230 | tuned (in_435, in_520) | Missing | |
| MD-75 | Loft (two or more closed sketches) and Sweep (a closed sketch and a path chain) with wireframe previews and option chips | loft.ts; sweep.ts | tuned (in_445-658) | Missing | |
| MD-76 | Direct shape editing: Move or Rotate of a corner, edge or flat face shapes a flat-faced body | reshape.ts | | Missing | |

### 3i. History, bodies list, parameters
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-77 | ⋯ > History opens a Model panel with tabs Steps, Bodies, Sketches, Constraints, Parameters, Measure; steps labelled ("Extrude 10 mm", "Fillet 2 mm") | panels.ts:17-47 | tuned (dec_model_panel) | Part: a step list; no tabs | |
| MD-78 | At the last step a number is editable in place; the model rebuilds; one undo takes it back; a number can be tied to a named parameter or formula | panels.ts:164-202; dec_named_parameters | tuned | Part: numbers editable at any step; no parameters UI (the engine has them) | |
| MD-79 | Choosing an earlier step shows the model as it was, later steps faded; "Insert here" puts new work at that point; a failed step shows its error in red | panels.ts:183-208 | tuned (dec_history_navigation) | Part: failed steps in words; no rewind | |
| MD-80 | The Bodies tab lists "Body N · material" with eye and delete; Select all, Select none, Hide all, Show all | panels.ts:54-68 | | Missing | |

### 3j. Cross section, looks, cut tool
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-81 | A cross section is a sheet through the part with a mode icon (cuts the upward half / the other half / does not cut), an eye, a move/rotate icon, a trash icon; panes lay it across an axis; its orb can be placed on a corner, edge or face; numbers typable | control/section.ts; bar.ts:35-47; dec_cross_section | tuned (in_416, in_459, in_1129) | Part: a placed sketch plane cuts; no sheet object | |
| MD-82 | Teal selection and the hover ring are clipped where cut; the cut face is a real pickable, sketchable face, darker and hatched | ui/orb.ts:13-14 | tuned (in_680, in_681) | Part: hatched cap; not pickable | |
| MD-83 | Four looks (Solid, See-through, Cut, Marked); Wireframe in View stays until toggled | ui/looks.ts; dec_view_looks | tuned (in_1379) | Part: three looks; no wireframe toggle | |
| MD-84 | Cut tool (Parts): bodies shown as the pieces, each with + kept or − tossed; Joined or Separate option | control/select.ts:124-190; ui/cutparts.ts | tuned (in_294, in_298, in_595) | Missing | |
| MD-85 | Esc lets go in steps (menu, drag select, motion, picking, orient, cross section, tape, cut, box, repeat, operation, tool, preview, sketch mode, adding, then the selection) | control/modal.ts:386-406 | hack (a long chain) | Part | |

### 3k. Measuring, notifications, game mode, reset
| ID | The prototype | Source | Flag | Rebuild | Your mark |
|---|---|---|---|---|---|
| MD-86 | Tape measure: pick a face, or two; shows gap, distance, axis offset, angle as bubbles; opens the Measure tab | tape.ts; control/modal.ts:395 | tuned (in_338, in_612) | Missing | |
| MD-87 | The Measure tab follows the selection: model volume, weight (1.24 g/cm³ PLA), size; body area, size, Z range, counts; faces and edges area, radius, tilt, length, angle or distance between two | measure.ts; dec_measure_report | tuned (in_633-643) | Missing | |
| MD-89 | One notice list: status (bottom line), refusal (a pill with a button), help (words on an arrow, "pull to copy"), busy ("Working…"); at most one each | notice.ts; ui/notices.ts; dec_ui_unification | tuned (in_665) | Part: one bottom line; busy in the step list | |
| MD-92 | Refusal sentences name what to select ("select a flat face of the body first", "select two or more closed sketches to loft through"…) | operations.ts | | Part | |
| MD-94 | Game mode: W, A, S, D (or Space) starts it; the pointer is locked to the middle with a small ring; the mouse turns, keys walk, Alt frees the pointer, the wheel zooms, Esc leaves | recognizer.ts; ui/crosshair.ts | tuned (in_300-304) | Built | |
| MD-95 | "Reset camera" appears at the top centre when nothing of the model is in sight; one click returns to the last thing seen | ui/resetview.ts | tuned (in_303) | Built | |
| MD-96 | X, Y, Z and N look along an axis or normal to the selection; while a move or rotate is being set up they choose its axis | ui/controls.ts; control/viewing.ts:85-107 | | Part: X, Y, Z (no N) | |
| MD-98 | On touch a bottom pill holds undo and redo; an operation's check is on every device | ui/toolchip.ts:56-80 | tuned (in_664) | Part: check on every device; no touch bar | |

### 3l. Outside the rebuild's scope so far (listed so nothing is lost)
| ID | The prototype | Rebuild | Your mark |
|---|---|---|---|
| MD-91 | Hard bodies cannot go into each other; a drag stops where it hits; hardness is a deletable constraint | Skip for now | |
| MD-93 | Mate refusals say which body would move; tried the other way round | Skip for now (no mates) | |
| MD-97 | Joints can be played: a bottom bar with play, slider, switch | Skip for now | |
| CN-15, 31, 32, 45, 53, 67, 68, 71 | Mate bubbles and their suggestions, tape-measure numbers, hard-body badges | Skip for now | |
| SK-29 | Cam, gear and model tools: the first click is a centre, the second sets scale, a number box stays open | Skip for now | |

## Counts and what the list says

261 rows in sections 1 to 3k (3l is extra): **Built 49, Part 67, Differs 13, Missing 129, Skip 3**.
By section: sketch drawing 101 rows (Built 24, Part 18, Differs 4, Missing 54), constraints and dimensions 75 (Built 18, Part 19, Differs 4, Missing 33), modeling 85 (Built 7, Part 30, Differs 5, Missing 42). The three research passes found 110, 99 and 99 behaviours; rows that say the same thing, hacks and some touch variants are folded together here.

- **Built or nearly** are mostly the engine-side behaviours: the solver, dragging, trim, regions, bubble placement, the ring, extrude with add or cut, undo, files.
- **Missing** are mostly the **drawing aids** (dashed guides, hint icons, snap kinds, typed sizes while drawing), the **refusal button and its animations**, **selection tools** (box, similar, click counts), **the helper bar's near suggestions**, **polygon, spline, offset, mirror, repeat**, and the **modeling operations** (revolve, loft, sweep, hollow, scale, variable fillet).
- **Differs on purpose or by accident**, worth a decision: points snap to the grid (the prototype's grid is display-only, SK-46); a click on a curve adds a constraint (the prototype only places the point, SK-49); dimensions are always locked and have no padlock (CN-35); the bar stands up-right of the pick (CN-56); push/pull is one kind (MD-52); arc by centre, start, end (SK-25).
- **Old code not to copy** (marked hack): the dead `hintConstraints` switch (SK-62), the re-arm of the last tool (SK-16), unbound key actions (MD-4), the Esc chain (SK-13, MD-85), the layered fallbacks of push/pull (MD-54), the silent corner retry of fillets (MD-59), the twin-edge special case (MD-37), the hand-listed repeat allowlist (MD-23), and `stackOffset`'s `0 - index` (CN-24).
