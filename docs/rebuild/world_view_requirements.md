# World view and camera: requirements (DRAFT, for the human to correct)

Status: **draft, `ai-unreviewed`.** Built from what the human said (`in_` numbers, verbatim in `docs/human-input.md`) and from how the current app (`app/`) behaves today, checked by running it. Nothing here is accepted until the human has marked it. A mark is KEEP, CHANGE (say how) or DROP. Each KEEP gets a test, and the area is done when this list and the app agree.

"Today" means the app on this branch. "Later said" marks where the human changed their mind, so the older words are not a requirement.

## A. The world (what is drawn)

| ID | Requirement | Source | Test | Mark |
|---|---|---|---|---|
| W1 | Light world: white background (`in_018`, `in_065`). Charcoal "pencil" axes, thin, **positive** X, Y, Z only, arrowheads built into the lines, small letters X Y Z at the tips (`in_065`, `in_161`: "back to three lines positive x y z"). The axes have real length (24 mm) so they zoom with the model (`in_122`). They and their letters never show through objects (`in_122`, `in_194`). | in_065 in_122 in_161 in_194 | screenshot of the home view; a body in front hides the axis | |
| W2 | One world plane's grid is always on: the floor (Z) at the start (`in_190`). Fine, light charcoal-grey lines, stronger lines every few steps (`in_017`, `in_020`); the lines are spaced for the zoom, so you can tell when you zoom (`in_017`). The grid fades into distance fog at the edges and toward the horizon (`in_193`, `in_017`). The fog is of the world, not of the plane: the plane does not darken (`in_022`, `in_121`). Later said: the grid is **on** in a straight view too (`in_117` turned it off, `in_190` put it back). | in_017 in_022 in_190 in_193 | screenshot; the spacing steps with zoom; far lines fade | |
| W3 | Three small translucent panes with slightly rounded corners, a little away from the axes' origin (`in_065`, `in_193`). They are real size, so they zoom with the model (`in_159`). Only the three facing the viewer at the start (the positive sides) are used (`in_161`). They are not selectable as faces and truly invisible edge-on: no darkening at a shallow angle (`in_121`). They fade out when the view goes straight and back in when it leaves it (`in_436`, `in_442`). A model surface under the pointer wins over a pane in front of it (`in_135`). | in_065 in_121 in_135 in_161 in_193 in_436 in_442 | picking test: pane vs. body; opacity is 0 in a straight view | |
| W4 | Clicking a pane switches the plane that is on (grid and hover disc go to it) and goes straight to it; a double click is not needed (`in_190`). Only the plane that is on has the hover disc (`in_190`). The selected pane is the app's one selected colour, teal (`in_206`); the two others stay grey. | in_190 in_206 | click test: plane on = clicked, view straight | |
| W5 | The hover mark is a flat, soft, translucent disc on the surface under the pointer, scaling with zoom, with no hard edge (`in_073`, `in_159`, `in_300`). A click fills the surface with the colour (`in_073`). On the plane that is on it lands on the grid. | in_073 in_159 in_300 | disc present under pointer; size scales with zoom | |
| W6 | A small grey dot at the origin (the world orb, `dec_world_orb`, still provisional): clicking hides or shows the axes and panes. Not asked for in these words by the human (`in_463` asked for hiding); **say if you want it.** | in_463 | click toggles axes and panes | |

## B. The plane buttons (X Y Z, bottom right)

| ID | Requirement | Source | Test | Mark |
|---|---|---|---|---|
| B1 | Three round buttons X, Y, Z. A click selects that world plane (it becomes the one that is on) and turns the view straight to it, smoothly. Pressed again it looks from the other side. | in_067 in_190 in_143 | click X: straight, plane on = X | |
| B2 | The button of the plane that is selected has a ring (a bolder border of the same button, not a separate ring: `in_299`, `in_301`, `in_382`); it is there on the first load (`in_301`). | in_299 in_301 in_382 | Z has the ring at load | |
| B3 | As you orbit in 3D, the button of the axis the view is nearest to takes on the teal gradually (`in_295`); it works whatever plane is selected (`in_299`). In a straight view it reads the side being looked from: +X or -X (`in_145`). | in_145 in_295 in_299 | the nearest axis's button is teal at six straight views | |
| B4 | Keys: today there are **no** letter keys for views (`in_131` left them for later); N and the N button were removed (`in_088`). Say if X Y Z keys are wanted. | in_069 in_088 in_131 | | |

## C. The camera

| ID | Requirement | Source | Test | Mark |
|---|---|---|---|---|
| C1 | Start view: from the +X +Y corner, a little above (`in_069`). | in_069 | home camera numbers | |
| C2 | Orbit: left-drag on empty space, right-drag, or Alt+left-drag. It turns about the centre of the object nearest the camera in view, if there is one (`in_081`, `in_415`), and the object stays where it is on screen: no automatic re-centring (`in_082`). The pivot is kept for the whole drag (`in_291`). The smallest mouse movements turn the view a little less, rising to full over a few pixels (`in_420`). | in_081 in_082 in_291 in_415 in_420 | pure test: the pivot stays fixed on screen; fine gain | |
| C3 | Pan: middle-drag, Shift+right-drag, Space+drag. A trackpad two-finger scroll pans, less sensitively (0.3 of the scroll, `in_303`); a pinch zooms; a wheel zooms; a scroll is told from a wheel automatically (`in_079`). Touch: one finger orbits, two pan and pinch (`in_078`, `in_079`). | in_078 in_079 in_303 | wheel and scroll classification; pan follows the pointer | |
| C4 | Zoom is the camera moving toward or away from what is under the pointer, so a zoom in and the same zoom out come back to the same place (`in_200`, `in_414`). It works far from the origin and never gets stuck or tiny (`in_200`, `in_230`, `in_368`, `in_413`, `in_415`). It can go in close (to 0.3 mm, for small parts: `in_153`) but stops at a surface and never goes through it (`in_151`). Zoom out is about the view centre, no runaway. A saved file restores the zoom (`in_368`). | in_151 in_153 in_200 in_368 in_413 in_414 in_415 | pure test: in then out returns; far from origin; stops at a surface; save/load | |
| C5 | Straight views are really orthographic (`in_035`); going in and out is smooth, the perspective eases in and out, no jump (`in_193`). Leaving takes a drag of about 60 px so it is not left by accident (`in_193`). It is also left by W A S D (`in_469`). | in_035 in_193 in_469 | straight view has no perspective; a 50 px drag stays, 70 px leaves | |
| C6 | Game mode: any of W A S D turns it on; the keys move along the view and across it with easing, and the view turns with the mouse, less sensitively and smoothly, with the pointer held at the middle (`in_300`, `in_302`, `in_304`, `in_386`). It ends a moment after the last key goes up, or at Esc; a click does not end it (`in_304`). The centre cursor and its disc work for everything a mouse does: selecting, bubbles, buttons (`in_386`, `in_391`, `in_467`). The right-click menu stays in the world, not stuck to the camera (`in_463`, `in_471`) and the wheel cycles it (`in_467`); the camera may tilt to each item (`in_469`, `in_471`). Going in and out of it, and into a straight view, is smooth (`in_471`). | in_300 in_302 in_304 in_386 in_391 in_441 in_462 in_463 in_467 in_469 in_471 | pure test of easing and ending; browser test of pointer lock | |
| C7 | A Reset camera button appears when nothing of the model is in view; it goes to the last object that was in view, else home (`in_303`). | in_303 | button appears when the model is off screen | |
| C8 | Speed: orbiting, zooming and panning stay smooth on big models (`in_993`, `in_215`). | in_215 in_993 | a frame-time check on a heavy file | |

## D. Left for their own sections (they use the world view but are not part of it)
Going normal to a sketch and the cut to the plane (`in_1375`-`in_1387`); the cross-section sheets; the right-click menu's content; the orb that moves things (`in_1181`); the view looks (`in_1379`).

## Questions
1. W6: do you want the origin dot (hide/show the axes and panes)?
2. B4: do you want X, Y, Z keys for the straight views?
3. W3: only the three positive panes (`in_161`), as today, or both sides?
4. C6: is the right-click menu in space during game mode part of "game view", or does it wait for the menus section?
5. W2: is the grid wanted in a straight view (today yes)?
6. Is anything here that you do not care about, or missing?
