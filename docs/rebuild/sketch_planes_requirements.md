# Sketch planes, cut planes, the right-click menu and selecting: the requirements (for the human to approve)

Status: **a draft, `ai-unreviewed` until the human approves it** (`in_1441` is the brief; the rest is read from the prototype's decisions, named in the Source column). **Nothing is built.** Every row is marked `later` until its code is **prototyped and kept** (`in_1444`: no tests are written until the prototype is in a state worth preserving); a row then becomes `built` and `check_spec.py` demands its test. Rows marked **ASK** still hold a choice for the human; the ones answered in `in_1442` are listed near the end.

How to read a row: as in `world_view_requirements.md` (Inputs claimed, Contracts, Test kind `unit` / `browser` / `hand`). The contracts listed are the ones that exist in `next/` now; the new modules this section adds (`planes.ts`, `pick.ts`, `select.ts`, `menu.ts`) are named in the text and become contracts when their files exist.

## The idea in four lines (`in_1441`)
1. Two kinds of plane, **never the same object**: a *sketch plane* (where lines are drawn; looks like a world plane, with the grid; **only one is active**) and a *cut plane* (only cuts; **everything clicks through it**; drawn as just its border inside a box round what it cuts; its border can be selected for On / Off, Orient, Flip, Put away).
2. Starting a sketch on a surface puts **both** there: a sketch plane on the surface and a *temporary* cut plane in the same place (it can be switched off, not moved, and goes when the sketch is no longer active), so what is in front of the surface is cut away and the surface can be drawn on.
3. Either kind can be added anywhere, in any orientation; a plane can be turned into the other kind later (a sketch plane reused as a cross section).
4. The right-click menu comes back and carries the drawing options; clicking gets one grammar: a click selects one item, a double click a body, Shift adds or takes away.

## Contracts of this section
- `Intents` (`src/input.ts`): `click` (with its count), `hover`, `dragStart`; this section adds a `menu` intent (right click without movement, or a long press) and a modifier flag on `click` (`ViewState` and `Scene` below are what the picking reads).
- `ViewState` (`src/view.ts`): gains the active sketch plane (it is today's "plane that is on", W5, W13) and the list of cut planes.
- `Scene` (`src/scene.ts`): things and the ray test `hitThings`; gains faces, lines and vertices to pick (stand-ins until the model exists).
- `UiState` (`src/ui.ts`): what the view hands to the page's own parts (the menu, the cut plane's bubble).
- `Drawing` (`src/world.ts`): what the view hands to the drawing (the planes, the hover disc, the clip of the cut planes).
- `settings` (`src/settings.ts`): groups `world`, `theme`, `input`, and a new `planes` group (sizes, opacities, the double-click time).

## Inputs this section claims
- mouse: right click without movement; left click on a cut plane's border; left click on a face, a line, a vertex or a body; double click; shift+left click; shift+double click
- trackpad: tap to click; two-finger tap (right click)
- touch: long press; tap on a face, a line, a vertex or a body; double tap
- keys: shift while clicking; escape closes the menu

---

## P. Sketch planes

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| P1 | A *sketch plane* is a flat surface the drawing tools draw on. The world planes X, Y, Z are sketch planes (the pane/button that makes one "on" is W13/B1); there is **exactly one active sketch plane** at any time, which is the plane whose grid is drawn (W5, W6). Making another active takes the grid off the old one. | in_1441 in_190 | | `ViewState` | unit | later |
| P2 | A sketch plane looks like a world plane: the same light grid, fog, sharpness and spacing rules (W5 to W9), and it is **not drawn as a pane** beyond its grid (no icon, no tint). Only the active one has a grid; the others are not drawn. | in_1441 in_017 in_190 | | `settings.world`, `Drawing` | browser | later |
| P3 | **Add anywhere:** the menu (M3) adds a sketch plane at the point looked at (C3), facing the camera, and makes it active. It can then be moved and turned freely (P12), so any position and orientation is reachable. | in_1441 in_383 | | `ViewState` | unit | later |
| P4 | **Sketching on a surface:** a sketch tool started on a face (or clicked on a face while a tool is armed) makes the active sketch plane **exactly that face's plane**, with the sketch's axes taken from the face; the view then turns straight to it from the side the eye is on (C11), as in the prototype's "sketch group" rule. The plane belongs to the body it was made on and follows it when the body moves, turns or scales. | in_1441 in_229 in_233 in_234 | click on a face | `ViewState` | unit | later |
| P5 | A sketch tool started with nothing under the pointer draws on the active sketch plane (the floor at first). | in_069 in_190 | click on a pane | `ViewState` | unit | later |
| P6 | **Clicks on the active sketch plane's surface only reach the plane when nothing is in front of it**, and only the drawing tools use it; the plane is never itself selected as a thing, and a plane that merely lies in a face does not take that face's clicks (the W12 rule, now for the active sketch plane). | in_1441 in_135 in_1409 | click, hover | `Scene` | unit | later |
| P7 | A sketch on a curved face (a cylinder, a sphere) gets a plane: for a face that has a flat edge loop, the plane of that loop; otherwise the plane tangent at the point clicked. (agreed, `in_1442`) | in_383 | click on a face | `ViewState` | unit | later |

## Q. Cut planes

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| Q1 | A *cut plane* is a flat, infinite cut through everything: the half of every body (and of every sketch) on one side of it is not drawn, so the inside can be seen and reached; only its border is drawn (Q3). It cuts only what exists; it never changes the model (a view, as the prototype's section, `dec_cross_section`). | in_1441 in_1442 in_392 in_459 | | `Drawing` | unit | later |
| Q2 | **Clicks, hovers, selecting and drawing go straight through a cut plane** to whatever is behind it: the plane's surface is never picked, never hovered, never given a hover disc, never takes a sketch. **The one exception is its border (Q3):** the line of its edge can be pointed at and selected (Q4). What a cut removes is not pickable either. | in_1441 in_1442 in_466 | click, hover | `Scene` | unit | later |
| Q3 | **A cut plane is drawn as its border only**: a thin line round the plane's edge, kept **inside a bounding box round what it cuts** (the box of the bodies the plane meets, with a margin), so it never runs off to infinity. No pane, no fill, no chips, no arrow. Where the plane meets solids the cut shows as a hatched cut face in darker grey, as the prototype had it; **the part that is cut away leaves nothing behind** (no ghost, no outline, `in_1443`). A switched-off cut plane is drawn as its border only, dimmer. | in_1441 in_1442 in_459 in_466 | | `settings.theme`, `settings.planes`, `Drawing` | browser | later |
| Q4 | **Selecting a cut plane's border** (a click on its line) selects the plane and offers its options in one small bubble at the click: **On / Off** (it cuts or it does not), **Orient** (shows its mover orb to move and turn it; the orb's working is its own section) and **Put away** (delete). Nothing else of the plane answers; the options go when the selection is let go (S6). **A temporary cut plane (R1) offers only On / Off.** | in_1442 in_1441 in_1129 in_1181 | click on a border | `UiState` | browser | later |
| Q5 | **The side of a cut plane toward the camera is always the side that is cut** (`in_1443`): the half between the eye and the plane is not drawn, and as the eye goes round to the other side of the plane the cut changes sides with it, so the inside is always seen. There is no flip. Several cut planes can be on at once; each cuts, and the picture is what is left. | in_1443 in_1441 in_466 | | `ViewState` | unit | later |
| Q6 | **Add anywhere:** the menu (M3) adds a cut plane at the point looked at, across the axis the camera looks along, selected with its orb shown (Orient, Q4), cutting the half toward the eye. It can be moved and turned freely with the orb. | in_1441 in_392 in_459 | | `ViewState` | unit | later |
| Q7 | A cut plane can be switched **off** (it stops cutting and is drawn dimmer, but stays) and on again, and put away (deleted) from the bubble of Q4; undo takes any of these back. | in_1442 in_416 in_466 | | `ViewState` | unit | later |

## R. The two together

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| R1 | Starting a sketch on a surface (P4) puts a **temporary cut plane** in the same place as the sketch plane: it cuts away what is between the eye and the surface (Q5) so that what is behind the sketch can be seen and sketched on; nothing is cut that was not there when the sketch began, as the prototype settled (`in_1385`). It can be switched off and on (Q4) but **not moved**, and it is **deleted when the sketch is no longer the active one** (a new sketch, a click away, the tool put away; the one rule: the sketch plane it was made with stops being active). It is never saved (R5). | in_1441 in_1442 in_1385 | | `ViewState`, `Scene` | unit | later |
| R2 | The sketch plane and its temporary cut plane are separate things made in one place (`in_1442`: yes): switching the cut off leaves the sketch plane; the sketch plane follows its body (P4) and the temporary cut plane stays with it while the sketch is active. A cut plane made deliberately (Q6, R4) is never moved by a sketch. | in_1441 in_1442 | | `ViewState` | unit | later |
| R3 | **Intent is never guessed**: a click always lands on the sketch surface or on what is behind; it never lands on a cut plane (Q2). A user who wants to cut and sketch gets a sketch plane and a cut plane in one place (R1, M4); one who wants to cut only gets a cut plane (Q6). | in_1441 | click | | unit | later |
| R4 | A sketch plane can be **turned into a cut plane** (a new cut plane is made in the same place, the sketch plane stays), and a cut plane can be **turned into a sketch plane** (a sketch plane is made in its place and made active, the cut plane stays). Both from the menu (M4). This is "reusing the planes as cross sections". | in_1441 | | `ViewState` | unit | later |
| R5 | **Planes you make deliberately persist and stay where you left them**: sketch planes (M3, R4) and cut planes (Q6, R4), with their on or off, their side, and where they are, saved in the model's file. **Temporary cut planes (R1) are not saved**; a sketch plane made on a face is stored with its sketch (`dec_sketch_belongs_to_step`). | in_1442 in_1441 | | | later | later |

## M. The right-click menu

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| M1 | A right click that did not move (less than the click distance, C2) opens the menu **at the pointer, in the world**. A right drag still orbits (C2); a drag never opens the menu. | in_1441 in_235 | right click without movement | `Intents` | unit | later |
| M2 | The menu is **the prototype's ring** (`in_1442`): it closes on Esc, on a click outside it, and after one item is chosen (the sketching tools say they stay on, M5); a long press opens it on a touch screen (0.4 s), and a button does too. Items are always all there, dimmed when they cannot work. | in_1442 in_1441 in_235 in_542 in_661 | escape, long press | `UiState` | unit | later |
| M3 | **The drawing options live in the menu**: Line, Rectangle, Circle, Arc (the sketching tools that exist), and **Sketch plane** and **Cut plane** (add one, P3, Q6). The menu shows only what is possible (a tool is offered when something can take a sketch); nothing is hidden for good: an item that cannot work now is dimmed, not left out. | in_1441 in_538 in_661 | | `UiState` | unit | later |
| M4 | What is under the right click changes the menu: on a face it offers **Sketch here** (P4 with R1's pair); on a sketch plane or the grid **Make a cut plane here** (R4); on a cut plane's border **Make a sketch plane here** (R4) besides the options of Q4. | in_1441 in_466 | right click on things | `UiState` | unit | later |
| M5 | A sketching tool chosen from the menu stays on after each figure until Esc, a click on the cross in the top pill, or a right click puts it away (the prototype's trial, `in_193`). A right click while a tool is on puts it away instead of opening the menu. | in_193 in_1441 | right click, escape | `Intents` | unit | later |
| M6 | **In game mode the ring works as the prototype's did** (`in_1442`): a right click puts it in the world where it was opened (it stays there while the camera moves about), the centre cursor chooses from it, the wheel cycles it, it closes on a click outside it or on Esc, and the camera stays on (C20). | in_1442 in_420 in_441 in_463 in_467 | | `UiState` | hand | hand |

## S. Selecting (one grammar)

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| S1 | A **single click selects exactly one item**: a face, a line (edge, sketch line, arc, circle), a vertex (corner), or a closed shape of a sketch; never a whole body and never a cut plane (Q2). The one selected before is let go. | in_1441 in_069 | click on a face, a line or a vertex | `Intents`, `Scene` | unit | later |
| S2 | Where several things lie under the pointer, the order of what a single click takes is **vertex, then line, then face** (a shape before the face under it); a sketch plane and the world panes lose to all of them, by W12 and P6. | in_083 in_088 in_135 | click | `Scene` | unit | later |
| S3 | A **double click selects the whole body** that the thing under the pointer belongs to (face, line or vertex of it; for a lone sketch with no body, the whole sketch, `in_1442`: yes). **A double click selects bodies and nothing else** (`in_1442`). | in_1441 in_1442 in_186 in_235 | double click | `Intents` | unit | later |
| S4 | **Shift + click** on an item adds it to the selection if it is not selected, and takes it out if it is (a face stays a face: taking out a face does not take out the body's other items). **Shift + double click** adds a whole body if it is not all selected, and **takes the whole body out** if it is selected. (Ctrl / Cmd + click means the same as Shift, as the prototype had it.) | in_1441 in_257 in_258 | shift+left click, shift+double click | `Intents` | unit | later |
| S5 | The selection is **ordered** (the first selected moves to meet the one selected after it, a part that cannot move stays), and shift-adding keeps the order of the clicks. | in_1441 in_229 | shift+left click | `Intents` | unit | later |
| S6 | A click on nothing lets go of everything; Esc lets go of everything. A click that begins a drag of the view (C2) selects nothing. | in_069 in_1441 | click, escape | `Intents` | unit | later |
| S7 | The hover shows what a click would take: the hover disc and the highlight of that one face, line or vertex (W14); with Shift held it shows what a click would add (or take out). | in_073 in_159 in_1441 | hover | `Drawing` | browser | later |
| S8 | A tap on a touch screen is a click, a double tap a double click; Shift is a toggle button (the "add to selection" switch) because a touch screen has no key. | in_077 in_078 in_258 | tap, double tap | `Intents` | hand | hand |

---

## Prototype 1 (built, to try by hand; no tests, `in_1444`)
Try it: `cd next && npm run dev`, then open the page. **In it:** the right-click ring (Line, Rectangle, Circle, Arc dimmed; Sketch plane; Cut plane; on a face also Sketch here; on a cut plane's border its own options); a cut plane drawn as its border in a box round the model (10 % margin), cutting the half toward the camera (it changes sides as you orbit), hatched cut faces, a bubble of round icon buttons on its border (on/off, orient, sketch plane here, put away); *Orient* shows the **mover orb** (`mover_orb_requirements.md`) that moves, turns and copies it; a sketch plane with the grid (facing the camera at the point looked at, or on a face with a temporary cut plane that has only On/Off and goes when another plane is made active or an X Y Z button is pressed); selecting: one click one item (corner, line, face), double click a body, Shift toggles, a click on nothing or Esc lets go; hover shows what a click would take. **Not in it:** the sketching tools, moving or orienting a sketch plane, turning the view straight to a new sketch plane, the ring in game mode (M6), long press on touch, saving (R5), picking the cut plane's border through a body. Code: `src/planes.ts`, `pick.ts`, `select.ts`, `menu.ts` and the wiring in `main.ts`.

## What the prototype did that this draft changes or drops (so it is not a requirement by accident)
- **Double click no longer turns the view straight to a plane**, and **triple click no longer selects the object**: a double click takes the body (`in_1441`). Turning straight happens when a sketch starts (P4) and when a pane or a button is used (W13, B1). (agreed, `in_1442`)
- **Repeated clicks on one spot used to cycle through the things under the pointer** ("2 of 3 here"). This draft says a single click takes one item (S1) in a fixed order (S2). (agreed, `in_1442`)
- The prototype's cross-section sheet had a chip row and modes (cuts which half, doesn't cut, invisible, move icons); the cut plane keeps only its border and one bubble of options (Q4). "Does not cut" is no longer a mode of the plane; the sketch plane is the plane that does not cut.
- The prototype's sheet was also pickable as a face to sketch on; the cut plane is not (Q2). The sketch plane takes that role.

## Not in this section
The mover orb itself (its arrows, rings, sphere and typing, `dec_unified_orb`), the sketching tools' drawing (lines, constraints, snapping), what the menu does for bodies (operations), and the details of how steps and history store a sketch. They are later sections; this one says only where they plug in.

## Answered by the human (`in_1442`)
1 (curved faces) yes. 2 (the cut plane's handle): **tried as: a border only inside a bounding box, selectable by its edge, with On / Off and Orient** (Q3, Q4). 3 (on / off) yes. 5 (the pair is separate) yes. 6 (saved) yes for planes made on purpose, not for the temporary ones (R5). 7 the prototype ring, with its game mode way (M2, M6). 8 yes. 9 yes: a double click only selects whole bodies. 10 yes: no cycling.

Then (`in_1443`): the side toward the camera is always the one cut (Q5; so no Flip); the cut face stays hatched and nothing is left of the cut-away part (Q3); the border stands off by 10 % of the box (settings.planes), a plane across empty space being a small default square. **One reading to check:** "only what existed when the sketch began" (R1) was not mentioned and is kept.

## Still for the human
Nothing open from this list. Say if the reading above is wrong; otherwise the next step is a prototype (no tests yet, `in_1444`).
