# Sketch planes, cut planes, the right-click menu and selecting: the requirements (for the human to approve)

Status: **a draft, `ai-unreviewed` until the human approves it** (`in_1441` is the brief; the rest is read from the prototype's decisions, named in the Source column). **Nothing is built.** Every row is marked `later` until its code and test exist; a row then becomes `built` and `check_spec.py` demands its test. Rows marked **ASK** hold a choice I made that the human should confirm or change; they are collected at the end.

How to read a row: as in `world_view_requirements.md` (Inputs claimed, Contracts, Test kind `unit` / `browser` / `hand`). The contracts listed are the ones that exist in `next/` now; the new modules this section adds (`planes.ts`, `pick.ts`, `select.ts`, `menu.ts`) are named in the text and become contracts when their files exist.

## The idea in four lines (`in_1441`)
1. Two kinds of plane, **never the same object**: a *sketch plane* (where lines are drawn; looks like a world plane, with the grid; **only one is active**) and a *cut plane* (only cuts; **everything clicks through it**; its only handle is a small icon that shows its mover orb).
2. Starting a sketch on a surface puts **both** there: a sketch plane on the surface and a cut plane in the same place with its orb hidden, so what is in front of the surface is cut away and the surface can be drawn on.
3. Either kind can be added anywhere, in any orientation; a plane can be turned into the other kind later (a sketch plane reused as a cross section).
4. The right-click menu comes back and carries the drawing options; clicking gets one grammar: a click selects one item, a double click a body, Shift adds or takes away.

## Contracts of this section
- `Intents` (`src/input.ts`): `click` (with its count), `hover`, `dragStart`; this section adds a `menu` intent (right click without movement, or a long press) and a modifier flag on `click` (`ViewState` and `Scene` below are what the picking reads).
- `ViewState` (`src/view.ts`): gains the active sketch plane (it is today's "plane that is on", W5, W13) and the list of cut planes.
- `Scene` (`src/scene.ts`): things and the ray test `hitThings`; gains faces, lines and vertices to pick (stand-ins until the model exists).
- `UiState` (`src/ui.ts`): what the view hands to the page's own parts (the menu, the planes' icons).
- `Drawing` (`src/world.ts`): what the view hands to the drawing (the planes, the hover disc, the clip of the cut planes).
- `settings` (`src/settings.ts`): groups `world`, `theme`, `input`, and a new `planes` group (sizes, opacities, the double-click time).

## Inputs this section claims
- mouse: right click without movement; left click on a face, a line, a vertex or a body; double click; shift+left click; shift+double click
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
| P7 | A sketch on a curved face (a cylinder, a sphere) gets a plane: for a face that has a flat edge loop, the plane of that loop; otherwise the plane tangent at the point clicked. **ASK 1** | in_383 | click on a face | `ViewState` | unit | later |

## Q. Cut planes

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| Q1 | A *cut plane* is a flat, infinite cut through everything: the half of every body (and of every sketch) on one side of it is not drawn, so the inside can be seen and reached. It cuts only what exists; it never changes the model (a view, as the prototype's section, `dec_cross_section`). | in_1441 in_392 in_459 | | `Drawing` | unit | later |
| Q2 | **Clicks, hovers, selecting and drawing go straight through a cut plane** to whatever is behind it; it is never picked, never hovered, never selected, never given a hover disc, and never takes a sketch. What a cut removes is not pickable either (the prototype's rule: picking leaves out what is cut away). | in_1441 in_466 | click, hover | `Scene` | unit | later |
| Q3 | A cut plane is drawn like the prototype's cross section plane but simpler: a translucent grey pane (the world panes' grey), the cut faces of solids drawn solid darker grey with a hatch where the plane meets them, and **no chips, arrow or panes**. | in_1441 in_459 in_466 in_1129 | | `settings.theme`, `Drawing` | browser | later |
| Q4 | Its **only handle is one small icon** on the plane, which shows or hides the plane's **mover orb** (the orb that moves and turns it: the arrows, the rings, the sphere; its working is the orb's own section). The icon is the only part of a cut plane that answers the pointer. It is kept near the plane's middle (or the nearest point of the plane in view), the same size on the screen. **ASK 2** | in_1441 in_1129 in_1181 | click on the icon | `UiState` | browser | later |
| Q5 | A cut plane cuts the side it was made facing away from (the side toward the eye is removed, so the inside is seen); which side is a property of the plane and can be flipped from the menu (M6). Several cut planes can be on at once; each cuts, and the picture is what is left. | in_1441 in_466 | | `ViewState` | unit | later |
| Q6 | **Add anywhere:** the menu (M3) adds a cut plane at the point looked at, across the axis the camera looks along, with its orb shown, cutting the half toward the eye. It can be moved and turned freely with the orb. | in_1441 in_392 in_459 | | `ViewState` | unit | later |
| Q7 | A cut plane can be switched off (it stops cutting and stops being drawn, but stays in the list) and put away (deleted) from the menu; undo takes either back. **ASK 3** | in_416 in_466 | | `ViewState` | unit | later |

## R. The two together

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| R1 | Starting a sketch on a surface (P4) puts a **cut plane in the same place as the sketch plane, with its orb hidden**; it cuts away what is in front of the surface (toward the eye) so that what is behind the sketch can be seen and sketched on. Nothing is cut that was not there when the sketch began, as the prototype settled (new things are not cut by it). **ASK 4** | in_1441 in_1385 | | `ViewState`, `Scene` | unit | later |
| R2 | The pair is two separate things that start in one place: the cut plane (orb hidden) can then be moved on its own with its icon, and the sketch plane stays put on the face; moving the sketch plane (with its owning body, P4) moves the pair that was made with it. **ASK 5** | in_1441 | | `ViewState` | unit | later |
| R3 | **Intent is never guessed**: a click always lands on the sketch surface or on what is behind; it never lands on a cut plane (Q2). A user who wants to cut and sketch gets a sketch plane and a cut plane in one place (R1, M4); one who wants to cut only gets a cut plane (Q6). | in_1441 | click | | unit | later |
| R4 | A sketch plane can be **turned into a cut plane** (a new cut plane is made in the same place, the sketch plane stays), and a cut plane can be **turned into a sketch plane** (a sketch plane is made in its place and made active, the cut plane stays). Both from the menu (M4). This is "reusing the planes as cross sections". | in_1441 | | `ViewState` | unit | later |
| R5 | Cut planes and sketch planes are **saved in the model's file** and restored with it. **ASK 6** | in_1441 | | | later | later |

## M. The right-click menu

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| M1 | A right click that did not move (less than the click distance, C2) opens the menu **at the pointer, in the world**. A right drag still orbits (C2); a drag never opens the menu. | in_1441 in_235 | right click without movement | `Intents` | unit | later |
| M2 | The menu closes on Esc, on a click anywhere outside it, and after one item is chosen (the sketching tools say they stay on, M5). It is **one ring or list the same on every device**: on a touch screen a long press opens it where pressed (0.4 s), and a button does too. **ASK 7** | in_1441 in_235 in_542 in_661 | escape, long press | `UiState` | unit | later |
| M3 | **The drawing options live in the menu**: Line, Rectangle, Circle, Arc (the sketching tools that exist), and **Sketch plane** and **Cut plane** (add one, P3, Q6). The menu shows only what is possible (a tool is offered when something can take a sketch); nothing is hidden for good: an item that cannot work now is dimmed, not left out. | in_1441 in_538 in_661 | | `UiState` | unit | later |
| M4 | What is under the right click changes the menu: on a face it offers **Sketch here** (P4 with R1's pair); on a sketch plane or the grid **Make a cut plane here** (R4); on a cut plane's icon **Make a sketch plane here** (R4), **Flip**, **Switch off**, **Put away**, **Show / hide the orb**. | in_1441 in_466 | right click on things | `UiState` | unit | later |
| M5 | A sketching tool chosen from the menu stays on after each figure until Esc, a click on the cross in the top pill, or a right click puts it away (the prototype's trial, `in_193`). A right click while a tool is on puts it away instead of opening the menu. | in_193 in_1441 | right click, escape | `Intents` | unit | later |
| M6 | The menu works in game mode as in the world: it stands where it was opened, stays while the camera moves, is chosen with the centre cursor, and closes on a click outside (C20). | in_420 in_441 in_463 | | `UiState` | hand | hand |

## S. Selecting (one grammar)

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| S1 | A **single click selects exactly one item**: a face, a line (edge, sketch line, arc, circle), a vertex (corner), or a closed shape of a sketch; never a whole body and never a cut plane (Q2). The one selected before is let go. | in_1441 in_069 | click on a face, a line or a vertex | `Intents`, `Scene` | unit | later |
| S2 | Where several things lie under the pointer, the order of what a single click takes is **vertex, then line, then face** (a shape before the face under it); a sketch plane and the world panes lose to all of them, by W12 and P6. | in_083 in_088 in_135 | click | `Scene` | unit | later |
| S3 | A **double click selects the whole body** that the thing under the pointer belongs to (face, line or vertex of it; for a lone sketch with no body, the sketch). **ASK 8** | in_1441 in_186 in_235 | double click | `Intents` | unit | later |
| S4 | **Shift + click** on an item adds it to the selection if it is not selected, and takes it out if it is (a face stays a face: taking out a face does not take out the body's other items). **Shift + double click** adds a whole body if it is not all selected, and **takes the whole body out** if it is selected. (Ctrl / Cmd + click means the same as Shift, as the prototype had it.) | in_1441 in_257 in_258 | shift+left click, shift+double click | `Intents` | unit | later |
| S5 | The selection is **ordered** (the first selected moves to meet the one selected after it, a part that cannot move stays), and shift-adding keeps the order of the clicks. | in_1441 in_229 | shift+left click | `Intents` | unit | later |
| S6 | A click on nothing lets go of everything; Esc lets go of everything. A click that begins a drag of the view (C2) selects nothing. | in_069 in_1441 | click, escape | `Intents` | unit | later |
| S7 | The hover shows what a click would take: the hover disc and the highlight of that one face, line or vertex (W14); with Shift held it shows what a click would add (or take out). | in_073 in_159 in_1441 | hover | `Drawing` | browser | later |
| S8 | A tap on a touch screen is a click, a double tap a double click; Shift is a toggle button (the "add to selection" switch) because a touch screen has no key. | in_077 in_078 in_258 | tap, double tap | `Intents` | hand | hand |

---

## What the prototype did that this draft changes or drops (so it is not a requirement by accident)
- **Double click no longer turns the view straight to a plane**, and **triple click no longer selects the object**: a double click takes the body (`in_1441`). Turning straight happens when a sketch starts (P4) and when a pane or a button is used (W13, B1). **ASK 9**
- **Repeated clicks on one spot used to cycle through the things under the pointer** ("2 of 3 here"). This draft says a single click takes one item (S1) in a fixed order (S2). **ASK 10**
- The prototype's cross-section sheet had a chip row and modes (cuts which half, doesn't cut, invisible, move icons); the cut plane keeps only an icon (Q4). "Does not cut" is no longer a mode of the plane; the sketch plane is the plane that does not cut.
- The prototype's sheet was also pickable as a face to sketch on; the cut plane is not (Q2). The sketch plane takes that role.

## Not in this section
The mover orb itself (its arrows, rings, sphere and typing, `dec_unified_orb`), the sketching tools' drawing (lines, constraints, snapping), what the menu does for bodies (operations), and the details of how steps and history store a sketch. They are later sections; this one says only where they plug in.

## Questions for the human (**ASK**)
1. **Curved faces (P7):** the plane of the face's flat edge loop, else the tangent plane at the click. Fine, or something else?
2. **The icon's place (Q4):** near the plane's middle, kept on the screen. And how does a cut plane get picked at all (to delete it)? My choice: only by its icon and the menu (M4), so nothing else of the plane answers.
3. **Switch off / put away (Q7):** a cut plane can be turned off without deleting; or is "put away" enough?
4. **R1:** the pair's cut plane cuts the side toward the eye, and only what existed when it began.
5. **R2:** the pair is separate once made (moving one does not move the other); or should the cut plane follow the sketch plane until its orb is shown?
6. **R5:** the planes are saved with the model. (The prototype's cross section was not saved at first and was later; I take saved.)
7. **M2:** the ring menu of the prototype again, or a plain list? (Touch: long press.)
8. **S3:** for a lone sketch (no body) a double click selects the whole sketch.
9. **Double click no longer turns straight to a plane:** agreed?
10. **Cycling through overlapping things by repeated clicks:** dropped (S1, S2); agreed? (Another way to pick the one behind: the menu or Alt + click.)
