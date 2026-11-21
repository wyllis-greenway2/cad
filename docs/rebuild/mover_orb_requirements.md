# The mover orb: the requirements (for the human to approve)

Status: **a draft, `ai-unreviewed` until the human approves it.** The brief is `in_1446`; the rest is read from the old app's orb decisions (`dec_unified_orb`, `dec_mover_sphere`, `dec_orb_positioning`, `dec_sheet_planes`), whose many separate orbs (`moverHandles`, `gizmoFor`, `sectionGizmo`, `jointHandles`) are to become **one**. A first prototype is built (`next/src/orb.ts`, drawn in `world.ts`, the swapper in `menu.ts`, wired in `main.ts`) for the cut plane; **no tests until it is kept** (`in_1444`). Every row is `later` until then. Rows marked **ASK** hold a choice for the human.

## The idea (`in_1446`)
One orb for everything that is moved, with **three modes**, chosen by one swapper beside it: **move** (arrows along X, Y, Z from a ball), **rotate** (a ring about each of X, Y, Z), and **copy** (the move arrows with a second arrow beyond the end of each: dragging it makes a copy). Styled as the old one and working as it did.

## Contracts of this section
- `Intents` (`src/input.ts`): `grab`, `grabMove`, `grabEnd` (a press that takes a handle is the handle's, not the view's), `hover`.
- `Drawing` (`src/world.ts`): gains the orb's handles and which are lit.
- `UiState` (`src/ui.ts`): what the page's own parts show (the swapper, the number).
- `settings` (`src/settings.ts`): groups `mover`, `orb`, `theme`.

## Inputs this section claims
- mouse: left press on a handle of the orb; left-drag of a handle; shift+left press on an arrow
- keys: shift while pressing an arrow; escape lets go of held axes
- touch: press on a handle of the orb (a bigger target: later)

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| O1 | There is **one orb**, made by one function and drawn, hit-tested and dragged by one piece of code, for every thing that is moved (a cut plane now; bodies, sketch planes, mirrors, repeats later). A tool says which modes it offers; nothing else makes its own handles. | in_1446 in_1181 | | `Drawing` | unit | later |
| O2 | **Move mode:** three arrows along X, Y, Z from a ball at the middle; dragging an arrow moves along that axis by how far the pointer goes along it (the point on the axis nearest the pointer's ray); dragging the ball moves freely in the plane across the view. | in_1446 in_117 in_1181 | left-drag of a handle | `Intents` | unit | later |
| O3 | **Rotate mode:** a full ring about each of X, Y, Z (so the plane it turns in is plain) with one arrowhead for the way; dragging a ring turns about its axis, through the ball, by the angle the pointer goes round it. | in_1446 in_117 | left-drag of a handle | `Intents` | unit | later |
| O4 | **Copy mode:** the move arrows, each with a second arrow beyond its end; dragging a second arrow makes a copy and takes the copy along (for a cut plane: another cut plane). The first arrows still move. **ASK 1** | in_1446 in_1187 | left-drag of a handle | `Intents` | unit | later |
| O5 | **One swapper** beside the orb (three round buttons, the mode that is on lit; move, rotate, copy) changes the mode; the orb is always in exactly one mode. | in_1446 in_1181 | | `UiState` | browser | later |
| O6 | **Shift on an arrow holds a drag to the axes chosen:** one held is a line, two the plane of the two (the third never moves), none or three is free; the held arrows are lit teal; Esc lets them go. | in_652 in_1181 in_1207 | shift+left press on an arrow, escape | `Intents` | unit | later |
| O7 | While a handle is dragged a small number shows beside the pointer: the distance moved along the axis (mm), the plane's two axes with the distance, or the angle (degrees); nothing shows when nothing is dragged. | in_1181 in_1183 | | `UiState` | browser | later |
| O8 | The orb is **the same size on the screen wherever it is** (a share of the view's distance to it, 0.11) and is drawn on top of the model: charcoal arrows 2.2 px wide at 60 % opacity with small heads, charcoal ball, teal when pointed at, dragged or held. These are the old app's numbers. | in_1446 in_117 | hover | `settings.mover` | browser | later |
| O9 | A press on a handle is the orb's: it does not orbit, pan or click the view; a press anywhere else is the view's as before. The pointer over a handle shows a grab cursor and lights it. | in_1446 | left press | `Intents` | unit | later |
| O10 | The orb is shown for the thing it moves when that is selected and asked for (for a cut plane the *Orient* button of its bubble, or at once when it is made); it is put away with the same button. The orb never changes what is selected. | in_1446 in_1442 | | `UiState` | unit | later |
| O11 | Typed numbers: a number can be typed into the one that shows while dragging (place, turn, distance), as the old orb's bubbles. **later** | in_230 in_434 | | | later | later |
| O12 | Sticking to places (a corner, the middle of an edge or a face) and "a click on the orb selects it, then a corner clicked puts the orb there". **later** | in_652 in_1182 | | | later | later |
| O13 | The orb's axes can be turned (oriented) so that it moves along a face's own directions. **later** | in_417 in_421 | | | later | later |
| O14 | A second quantity on an arrow (a copy count, a spiral's advance): the copy mode's second arrow is that; its number is typed or dragged. **later** | in_1187 in_529 | | | later | later |

## What is dropped from the old orbs
The mode chip of each tool, the section's own move icon that went through five states, the orb's separate *orient mode* (a bubble at the top, wireframe body, an apply check) and its pulsing blue, the little panes of the mover (`in_1207`), and the sheet's own three panes *across X / Y / Z* (rotate does what they did). The cut plane's own *Across X / Y / Z*, *Face camera* buttons and its handle dot in the prototype are taken out: the orb moves and turns it.

## Questions (**ASK**)
1. **Copy mode for a cut plane:** the first drag of a second arrow makes one copy (a new cut plane, kept) and takes it along. Right, or should a typed count make several?
2. **Rotate about what:** the ring turns the plane about its own middle (the ball); the axes stay the world's. Right for now?
3. **Where the orb stands for a body or a sketch plane** (later sections): the middle of the box of what is selected; its axes the world's unless oriented (O13).
