# World view and camera: the requirements (for the human to approve)

Status: **a frozen draft, `ai-unreviewed` until the human approves it** (then it becomes an accepted decision and the tests are written against it). It replaces the earlier draft and is rewritten from what was said (`in_` numbers, verbatim in `docs/human-input.md`), what the human marked (`in_1397` onward), and what the first build (`next/`) settled while the human tried it by hand. Each row is one thing that can be tested.

How to read a row: **Inputs** are the user inputs it claims; **Contracts** are the shared interfaces or settings other sections may touch; **Test** is `unit` (a pure function in `view.ts`, `camera.ts`, `sense.ts` or `game.ts`, run in milliseconds), `browser` (a scripted run of the page), `hand` (only a person on a real device can judge), or `later` (waits for a section that does not exist yet). **Status** is `built`, `later`, or `hand`.

## Contracts of this section (what a later section must not break without re-testing the rows that list it)
One per line, `Name` (`file`): what it is. The impact tool reads these lines: a change to the file re-runs the tests of every row that lists the name.
- `Intents` (`src/input.ts`): `dragStart`, `orbit`, `pan`, `zoom`, `gesture`, `dragEnd`, `hover`, `leave`, `click`, `look`, `space`.
- `ViewState` (`src/view.ts`): the world view's state and the pure functions that change it.
- `Env` (`src/view.ts`): what is known when a change is made (the model, the size, the time, whether game mode is on).
- `Drawing` (`src/world.ts`): what the view hands to the drawing.
- `UiState` (`src/ui.ts`): what the view hands to the page's own parts.
- `Scene` (`src/scene.ts`): things with a box and a centre, and the ray test `hitThings`. **What the camera looks at is the box of each body the engine made** (`bodyThings`, from the extent of its points) **and, on the dev page, the stand-in boxes** (`lookedAt`); the camera's pivot (C3), step (C8), Reset (C17) and the axes going scale-free (W2) all go by them (`in_1710`).
- `settings` (`src/settings.ts`): groups `view`, `input`, `world`, `orb`, `buttons`, `ui`, `theme`, `light`; a row lists `settings.<group>`.

## Inputs this section claims (the conflict check compares these with other sections)
One device per line; claims separated by semicolons.
- mouse: left-drag on empty space; right-drag; alt+left-drag; middle-drag; shift+right-drag; space+drag; alt+shift+left-drag; wheel; left click on a pane; hover
- trackpad: two-finger scroll; pinch
- touch: one-finger drag; two-finger gesture; tap on a pane
- keys: space tap; w; a; s; d; escape while game mode is on
- pointer lock: game mode

---

## A. The world (what is drawn)

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| W1 | The world is light: a white background; thin charcoal "pencil" axes, **positive X, Y, Z only**, each with a small arrowhead built into the line and a small letter at its tip. | in_018 in_065 in_161 in_1408 | | `settings.theme`, `settings.world` | browser | built |
| W2 | The axes, the letters and the panes are the world's size (the axes 24 mm) **while the model is empty**, so they zoom with the world; **once the first sketch or object exists** they are scale free: the same size on the screen as at the home view, wherever the eye is; the change eases over a fraction of a second. | in_122 in_1406 | | `settings.world`, `Scene` | unit | built |
| W3 | The axes, their letters and the origin dot never show through objects. | in_122 in_194 in_1194 | | `Scene` | unit | built |
| W4 | The letter of an axis that the view looks along is not drawn. | in_122 | | `UiState` | unit | built |
| W5 | One world plane's grid is always on: the floor (Z) at the start; the plane that is on changes with a pane or a button. | in_190 | | `ViewState` | unit | built |
| W6 | Grid lines are at the world's own multiples from the origin. Their spacing is a power of ten set **by the camera's distance to the plane and by nothing else** (not by the direction of the view, not by what is in it); three spacings are drawn and fade into each other as the distance changes, so nothing pops. | in_017 in_1407 | | `settings.world` | unit | built |
| W7 | The grid fades into the distance (fog of the world, not a darkening of the plane); the fog's reach comes from the distance to the origin and to the plane. An orthographic view has no fog. | in_017 in_022 in_121 in_193 | | `settings.world` | unit | built |
| W8 | The grid is shown in a straight view too. | in_190 in_1397 | | | browser | built |
| W9 | The grid is sharp at any zoom (checked to a view 0.14 mm tall) and far from the origin. | in_1415 | | | browser | built |
| W10 | Three small translucent panes with slightly rounded corners stand a little away from the origin on the three positive sides; they are the world's size (scale as the axes do, W2); they fade out as the view goes straight and fade back in as it leaves. | in_065 in_159 in_161 in_193 in_436 in_442 in_1397 | | `settings.world` | unit | built |
| W11 | A pane is truly invisible edge-on (no darkening at a shallow angle) and is not selectable as a face. | in_121 | | | browser | built |
| W12 | A pane takes the click or the hover **only if no face is under the pointer, or the face under it lies exactly in the pane's own plane**; any other face under the pointer, in front of the pane or behind it, is plain face selection and the pane is left alone. | in_135 in_1409 | click, hover | `Scene` | unit | built |
| W13 | A click on a pane makes that plane the one that is on and turns the view straight to it; the pane that is on is the selected teal, the others grey, the one under the pointer lighter. | in_190 in_206 | click on a pane | `Intents.click` | unit | built |
| W14 | The hover disc is a flat, soft, translucent disc on the surface under the pointer (a face of a thing, or the plane that is on); it is the same size on the screen wherever it is; it follows the pointer while the view turns, pans or changes; in game mode it is at the middle of the screen. | in_073 in_159 in_300 in_1405 | hover | `Drawing` | unit | built |
| W15 | The origin dot is a small grey dot at the origin; pointing at it makes it a larger white disc with an eye (a click would show the axes and panes) or a crossed eye (a click would put them away); a click does that; a wheel over it zooms the view like anywhere else. | in_463 in_1397 in_1410 | click on the dot, wheel | `UiState` | browser | built |
| W16 | The look's numbers (colours, fog, opacities, sizes) are the prototype's values, which the human tuned by hand; they are in one settings file and not re-chosen. | in_024 in_025 in_031 | | `settings` | unit | built |

## B. The plane buttons (X Y Z, bottom right)

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| B1 | Three round buttons X, Y, Z at the bottom right. A click makes that world plane the one that is on and turns the view straight to it, smoothly; pressed again it looks from the other side. | in_067 in_143 in_190 | click on a button | `UiState`, `ViewState` | unit | built |
| B2 | The button of the plane that is on has a thinner, lighter-gray border (2 px, `#9a9ea6`) of the same button, not a separate ring; the Z button has it at the first load. | in_299 in_301 in_382 in_1416 | | `settings.ui` | browser | built |
| B3 | As the view comes round to an axis, that axis's button takes on the teal gradually, whatever plane is on; when it is more than half there it reads +X or -X (the side looked from). | in_145 in_295 in_299 | | `UiState` | unit | built |
| B4 | There are no letter keys for the straight views, and no N key or button. | in_088 in_1397 | | | unit | built |

## C. The camera

| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| C1 | The start view is from the +X +Y corner, a little above, 120 mm from the origin. | in_069 | | `settings.view` | unit | built |
| C2 | Orbit: left-drag on empty space, right-drag, or Alt+left-drag turns the camera about a pivot, by one angle per pixel, with no roll (Z stays up); the pivot stays where it is on the screen (no re-centring) and is kept for the whole drag; the pitch stops straight up and down and the eye stops with it. | in_081 in_082 in_291 | left-drag, right-drag, Alt+left-drag | `Intents.orbit` | unit | built |
| C3 | The pivot and every "point looked at" is **the average of the centres of what is in view, each weighted by how big it looks and by how near the middle of the screen it is** (fading over 30 % of the view's height): one thing that fills the view is its own centre, a group of small things (zoomed out) is the group's middle, and the point moves smoothly between the two, with no switch; it is always on the screen; with nothing in view it is the point straight ahead at the scale of what the eye is among. | in_081 in_291 in_415 in_1423 in_1424 | | `Scene`, `settings.view` | unit | built |
| C4 | The smallest mouse movements turn the view a little less, rising to all of it over a few pixels. | in_420 | | `settings.input` | unit | built |
| C5 | Pan: middle-drag, Shift+right-drag, Space held + drag, or Alt+Shift+left-drag slides the camera across the view so that what is grabbed (the surface under the pointer, else the point looked at) follows the pointer. | in_079 in_235 | middle-drag, Shift+right-drag, Space+drag | `Intents.pan` | unit | built |
| C6 | **Two fingers are one gesture, on a touch screen and on a trackpad alike** (`in_1427`): the view is slid by the motion of the pair (the scene follows the fingers, 1 to 1) and zoomed by the spread of the pair (toward the point between them), **at the same time**. On a touch screen the page sees both fingers; on a trackpad the browser reports the pair's motion as a scroll and its spread as a pinch, so the gesture is made of whichever arrives, with the same effect and the same sensitivity. A gesture keeps its kind while its events keep coming (160 ms), so the tail of a trackpad's flick is never taken for a wheel's notch. **A trackpad cannot do both at once, by the system's design** (measured, `in_1431`): during a pinch that also slides the fingers the browser reports only the pinch (62 control-wheel events, no scroll events, and the pointer position moves 2 to 3 px), because the system decides scroll or pinch from the gesture's first motion and reports only that; so on a trackpad the two alternate, and only a touch screen gives both together. A glide after a trackpad gesture was tried and taken out (it did not help, `in_1432`). A scroll goes the way the fingers go (natural) unless the system says otherwise. The trackpad's two-finger scroll pans by 0.3 of the scroll (set by hand, `in_303`, and put back by `in_1432` after being tried at 1) and its pinch zooms by 0.005 of its delta. A wheel's notch zooms. | in_078 in_079 in_160 in_303 in_1427 | trackpad scroll, pinch; two fingers; wheel | `Intents.gesture`, `Intents.zoom`, `settings.input` | unit | hand |
| C7 | One finger on a touch screen orbits (the same turn as the mouse's left-drag); a tap is a click. On a trackpad a one-finger drag with the button down is the mouse's left-drag. | in_078 in_160 | touch, left-drag | `Intents.orbit`, `Intents.click` | browser | hand |
| C8 | **Zoom is the camera going forward or back along the view, exactly as W and S do in flight**: one function, one step rule (a share of the scale of what the eye is among: the distance to the nearest thing's middle, never less than its own half-size or 20 mm). It goes along the ray through the cursor, so the point under the cursor stays where it is on the screen (in game mode the cursor is at the middle, so straight ahead). It goes through things. It does not take the eye more than 5,000 mm from the origin. | in_200 in_414 in_1411 in_1412 in_1417 | wheel, pinch | `Intents.zoom` | unit | built |
| C9 | Zoom works far from the origin and never gets stuck, tiny or runs away; it can go in close enough for small parts. | in_153 in_200 in_230 in_368 in_413 in_415 | wheel | | unit | built |
| C10 | In a straight view the wheel changes the picture's size about the cursor (the point under it stays put); the eye does not move; the view stays straight. | in_1414 in_1420 | wheel | `Intents.zoom` | unit | built |
| C11 | A straight view is **orthographic**: at rest it is drawn with an orthographic camera, so sliding it shows nothing of the third dimension; picking rays in it are parallel to the view. The plane's own axis is to the right (Z top: X right and Y up; X: Y right; Y: X right) and Z is up. | in_035 in_1419 in_1420 | | `ViewState` | unit | built |
| C12 | Going to a straight view (a button, a pane) or from it is an eased change (about 450 ms to, 350 ms from) in which what is held keeps its size and its place on the screen: the lens closes to 0.01 as the eye backs off, and at the end the picture is handed to the orthographic camera, within about half a pixel for things 20 mm off the plane; the plane's view is from the side the eye is on, and the same button again looks from the other side. | in_193 in_1420 | click on a button or a pane | `ViewState` | unit | built |
| C13 | A straight view is left by a drag of about 60 px (so it is not left by accident); the view then turns on from there, the pivot keeps its place on the screen, and the perspective comes in smoothly. **A straight view is left about the point it was entered about** (remembered while it is in view, given up when the hands zoom or slide), so going out and back by a button, again and again, changes nothing: the zoom of what is held and the size of the straight view are the same every time, whatever the scene (`in_1706`, `in_1708`). | in_193 | left-drag, right-drag | `Intents.orbit` | unit | built |
| C14 | There is no resting half-straight view, and the hands are never locked out: a drag, wheel or pan while a change toward a straight view is playing takes the view at once, and the perspective comes back smoothly from where it is. | in_471 in_1403 | | `ViewState` | unit | built |
| C15 | Game mode: a tap of the space bar turns it on or off (held with a drag it is the pan modifier, C5); W A S D turn it on too, and the key that did it moves the eye at once; Esc ends it, and so does the browser refusing to hold the pointer (it is not left on with a mouse that does nothing; tested in a page, the rest of the row by hand). It stays on until turned off. While on, the pointer is held at the middle of the view (pointer lock), a ring marks it, and the mouse turns the view about the eye (0.25 of the orbit's angle, smoothed); two fingers moving on a trackpad turn it the same way, in the direction the fingers go (`in_1435`; by hand: a page cannot make a trackpad scroll in a test). | in_300 in_302 in_304 in_386 in_1404 in_1408 | Space tap, W A S D, Esc, mouse | `Intents.space`, `Intents.look` | unit | hand |
| C16 | Flight: W S go forward and back, A D across the view, with easing, by the same forward function and step rule as the wheel (C8), through things; it never starts in a perspective that is not full: from a straight view (or during a change) the view first comes to full perspective, then the eye moves. | in_469 in_471 in_1411 in_1412 | W A S D | `Intents`, `ViewState` | unit | built |
| C17 | **Getting lost is recoverable.** A "Nothing in view: Reset camera" pill stands at the top when the model has things and none is in view (a thing is in view when its box meets the screen and is at least 6 px across, or is a lone point on the screen; boxes behind the eye do not count; far and tiny counts as lost), not while the view is changing. A click flies the view, eased, to the thing last seen (remembered while it was in view), else the last one there is, framed whole from the home direction; from any state (far, inside a thing, facing away, straight, in game mode which it ends). With an empty model, when the world's own axes are out of view, it offers the home view. | in_303 in_1399 in_1400 | click on the pill | `ViewState`, `Scene` | unit | built |
| C18 | Orbiting, zooming and panning stay smooth on big models. | in_215 in_993 | | `Scene` | hand | later |
| C19 | The camera is saved in a file and restored with it. | in_368 | | | later | later |
| C20 | In game mode the centre cursor does everything a mouse does (bubbles, buttons, selecting); the right-click menu stays in the world, not on the camera, and the wheel cycles it; the camera may tilt to each item. | in_386 in_391 in_441 in_463 in_467 in_469 in_471 | | | later | later |

---

## What the human changed from the prototype (so the old words are not a requirement)
A light world, not dark; axes positive only (not a star); the grid on in a straight view; the panes on the positive sides only, not both; no N button and no letter keys; the game mode switched by the space bar (and W A S D), no idle timeout; the wheel is flight's forward (no stop at a surface, no anchoring to a surface), toward the cursor; no "previous view" step back; the pivot a weighted middle of what is in view, not the nearest object's centre.

## The camera model the rows rely on
The camera is an eye, a direction, and a projection: perspective, or orthographic with a size. Everything moves it by two things: *move* the eye (along a ray, or across the view) and *turn* about a point (the pivot, or the eye itself in game mode). How far a step goes is one share of one scale (`scaleAmong`). The lens (how much perspective) exists only while the view changes between the two projections. No target, distance or zoom number is stored. Orbit and game-mode look are one function; the wheel and W S are one function.

## Not in this section
Going normal to a sketch and the cut to its plane; the cross-section sheets; the right-click menu's content; the mover orb; the view looks; selection of anything but a plane; the grid of a selected face's plane while sketching.

## For the human
Approve this list (or mark rows CHANGE or DROP). On approval it becomes an accepted decision, and the tests are written against the rows marked `unit` and `browser`; the rows marked `hand` become a checklist for a real mouse, trackpad and phone; the rows marked `later` wait for their section.
