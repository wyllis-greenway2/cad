# Sketch planes: the requirements (reduced; the rest was thrown away)

Status: **a draft, `ai-unreviewed`.** The first prototype of this section (`in_1441` to `in_1445`) built a lot at once: cut planes with borders, hatched cut faces and clipping, picking and selecting corners, lines and faces, a right-click ring with seven kinds of item, temporary cut planes and a bubble of controls. The human was not happy with it and asked for it to be thrown away so that only **the world and camera, the mover orb, and the sketch plane that carries the grid** remain (`in_1460`). What is left is below. What was thrown away, and what is still wanted of it, is under *Thrown away, to be redone* (kept so nothing the human said is lost). Nothing here has tests yet (`in_1444`).

## Contracts of this section
- `Intents` (`src/input.ts`): `menu` (a right click that did not move).
- `ViewState` (`src/view.ts`): `lookAlong` turns the view straight to any flat surface.
- `settings` (`src/settings.ts`): groups `world`, `planes`.

## Inputs this section claims
- mouse: right click without movement
- touch: long press (later)
- keys: escape closes the ring

## What there is now
- The world starts **empty** (no stand-in bodies; `?boxes=1` or `?boxes=3` in the address gives some, for trying the view).
- A **right-click ring** (right click without moving; it unfolds from the pointer, round icon buttons, words in the tooltips): Line, Rectangle, Circle, Arc (dimmed: not built) and **Sketch plane**.
- **One sketch plane placed anywhere** (the world's X, Y, Z planes being the other kind): it is made at the point looked at, facing the camera (snapped to a world axis within 8°), and **the view turns straight to it, orthographic**, as it does for a world plane. It carries the grid (spacing from the distance to it, as for a world plane). Making a world plane the one that is on (a pane or an X Y Z button) takes it away.
- A **cut** comes with it (`in_1461`, the simplest one): when the sketch plane is made, **everything on the camera's side of it is not drawn** — the side the camera was on when the view had turned straight to it. It is cut **once**: the side belongs to the plane, so turning the camera round to the other side does not cut again; it moves and turns with the plane (it has no controls of its own, nothing selects or moves it apart from the plane). Where it cuts a solid the cut face is painted solid grey with hatching. It works for any body (clipping plus a stencil count, `src/cutdraw.ts`).
- The **mover orb** is on it (`mover_orb_requirements.md`): it moves and turns the plane; the grid goes with it.

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| P1 | The right-click ring opens at the pointer on a right click that does not move (a right drag still orbits), closes on Esc, on a click outside it and after one item is chosen. | in_1441 in_1442 in_235 | right click without movement | `Intents` | browser | later |
| P2 | The ring's *Sketch plane* makes a sketch plane at the point looked at, facing the camera (snapped to a world axis within 8°), and it becomes the sketch plane that is on; its grid is drawn (not a world plane's). | in_1441 in_383 | | `ViewState` | browser | later |
| P3 | **Sketching on a plane is orthographic to that plane by default**: making a sketch plane turns the view straight to it (from the side the eye is on) and the view becomes orthographic, as for a world plane (`C11`, `C12`). | in_1460 in_190 in_193 | | `ViewState` | browser | later |
| P4 | There is one placed sketch plane at a time; pressing a pane of a world plane or an X Y Z button makes that world plane the one that is on and takes the placed one away. | in_1460 | click on a pane | `ViewState` | browser | later |
| P6 | **The cut:** a sketch plane made from the ring cuts away the half toward the camera as it was when the view turned straight to the plane, once; the side is the plane's own (its normal side), so it does not change when the camera goes round, and the cut moves and turns with the plane. The cut face of a solid is solid grey with hatching; nothing is left of the part that is cut away. | in_1461 in_1443 in_1385 | | `Drawing` | browser | later |
| P5 | The grid belongs to the sketch plane that is on: the placed plane's grid has the spacing and the fade that a world plane's has, from the eye's distance to it. | in_1460 in_017 in_1407 | | `settings.world` | unit | later |

## Thrown away, to be redone (the human's wishes, `in_1441`, `in_1442`, `in_1443`)
- **Cut planes** as things of their own (the first simple cut, P6, is part of the sketch plane): a cut plane only cuts; everything clicks through it; it is drawn as a border only, inside a box round what it cuts with a 10 % margin; the cut face of a solid is hatched, and nothing is left of the cut-away part; many can be on; one can be switched on and off; its border is the only thing that answers. **Being redone simpler** (see the handoff): the old app's way (clipping plus a stencil count for the cut face) works for any body, not only boxes.
- **A sketch on a surface** puts a sketch plane on it and a temporary cut plane (switchable, not movable, gone when the sketch is no longer the active one, never saved); a sketch on a curved face gets the plane of its flat edge loop, else the tangent plane at the click.
- **Selecting** (one grammar): a click selects one item (a corner, then a line, then a face); a double click a whole body; Shift adds or takes away (a double click with Shift a whole body); a click on nothing or Esc lets go.
- **Planes you make deliberately persist** (saved with the model); a sketch plane can be made a cut plane and back.
- **The ring in game mode** works as the old one did (stands in the world, the centre cursor chooses, the wheel cycles it); long press on touch.
- Not wanted: double click turning the view straight to a plane; cycling through overlapping things by repeated clicks.
