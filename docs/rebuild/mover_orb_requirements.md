# The mover orb: the requirements (for the human to approve)

Status: **a draft, `ai-unreviewed` until the human approves it.** The brief is `in_1446`; the rest is read from the old app's orb decisions (`dec_unified_orb`, `dec_mover_sphere`, `dec_orb_positioning`, `dec_sheet_planes`), whose many separate orbs (`moverHandles`, `gizmoFor`, `sectionGizmo`, `jointHandles`) are to become **one**. A first prototype is built (`next/src/orb.ts`, drawn in `world.ts`, the swapper in `menu.ts`, wired in `main.ts`) for the cut plane; **no tests until it is kept** (`in_1444`). Every row is `later` until then. Rows marked **ASK** hold a choice for the human.

## The idea (`in_1446`)
One orb for everything that is moved, **with no modes** (`in_1447`, replacing the three modes of `in_1446`), **on each of X, Y, Z a straight arrow out one side and a curved arrow out the other** (`in_1447`; chosen again after the star `in_1449`, `in_1450`, the C-shaped arrows round the axes `in_1451` to `in_1453` and the curved arrow out of each tip `in_1454` were tried and dropped, `in_1455`): from a ball at the middle, the straight arrow (it moves along the axis) and, out the other side, a stem along the axis to the middle of an open circle round it (about 280°) with a head (it turns about the axis). An arrow's head stands on the curve where the head begins, pointing the way the curve goes there, not the way it goes at its end (`in_1449`). **Extra arrows** (a second straight arrow beyond the first, for a copy) are not something the user adds or takes away: an operation has them or not, off unless it says, and which operations is to be specified later. Styled as the old one.

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
| O2 | **The straight arrows:** three arrows along X, Y, Z from a ball at the middle; dragging one moves along that axis by how far the pointer goes along it (the point on the axis nearest the pointer's ray); dragging the ball moves freely in the plane across the view. | in_1447 in_117 in_1181 | left-drag of a handle | `Intents` | unit | later |
| O3 | **The curved arrows:** on the other side of each axis from its straight arrow, a stem along the axis to the middle of an open circle (about 280°) round it with one head for the way; dragging one turns about that axis, through the ball, by the angle the pointer goes round (the plane through the ball across the axis). | in_1447 in_1455 in_117 | left-drag of a handle | `Intents` | unit | later |
| O4 | **Extra arrows:** an orb made for an operation that has them (`extras`) shows a second straight arrow beyond the end of each straight one, and dragging it makes a copy and takes the copy along (for a cut plane: another cut plane). **Off by default**; the user cannot switch them. Which operations have them is specified later. | in_1447 in_1187 | left-drag of a handle | `Intents` | unit | later |
| O5 | There is no mode and no swapper: the orb is always the same shape. | in_1447 | | `UiState` | unit | later |
| O6 | **Choosing arrows** (`in_1458`): a press on an arrow chooses it (and lets the others go); Shift adds a straight arrow to the straight ones chosen or takes a chosen one out; a curved arrow is chosen alone. Chosen arrows are lit teal and stay chosen until Esc, or the orb or the selection goes. A drag of a chosen straight arrow moves on **all the chosen arrows together**: one is a line, two the plane of the two (the third never moves), three free (in the plane across the view). | in_652 in_1181 in_1207 in_1458 | left press on an arrow, shift+left press on an arrow, escape | `Intents` | unit | later |
| O7 | **Each chosen arrow has an info bubble at its end that stays while it is chosen** and follows it: for a straight arrow where the orb stands along that axis (mm), for a curved one how far the thing has been turned about that axis (degrees). Nothing shows for an arrow that is not chosen, and no number follows the pointer. | in_1181 in_1183 in_1458 | | `UiState` | browser | later |
| O8 | The orb is **the same size on the screen wherever it is** (a share of the view's distance to it, 0.11) and is drawn on top of the model: charcoal arrows 2.2 px wide at 60 % opacity with small heads, charcoal ball, teal when pointed at, dragged or held. These are the old app's numbers. | in_1446 in_117 | hover | `settings.mover` | browser | later |
| O9 | A press on a handle is the orb's: it does not orbit, pan or click the view; a press anywhere else is the view's as before. The pointer over a handle shows a grab cursor and lights it. | in_1446 | left press | `Intents` | unit | later |
| O10 | The orb is shown for the thing it moves when that is selected and asked for (for a cut plane the *Orient* button of its bubble, or at once when it is made); it is put away with the same button. The orb never changes what is selected. | in_1446 in_1442 | | `UiState` | unit | later |
| O11 | Typed numbers: a number can be typed into the one that shows while dragging (place, turn, distance), as the old orb's bubbles. **later** | in_230 in_434 | | | later | later |
| O12 | **Orient mode** (`in_1456`, from the old app's `in_421`, `in_437`, `in_439`): a click on the ball (a press that does not move) makes it **pulse blue** and puts the orb in orient mode: a bar at the top says *Orient the mover* with a check and a cross; the orb's straight arrows now move **the orb itself** and its curved arrows turn **its own axes**, about the ball, and **the thing it stands for does not move**; a corner, a line or a face clicked puts the orb there (a face also lays its axes along the face). Enter or the check or a click on the ball again keeps it; Esc or the cross puts it back as it was. The orb's place and axes are remembered for the thing (an offset from it), so they go with it; the straight arrows then move along the orb's axes and the curved ones turn about its middle. | in_1456 in_417 in_421 in_439 | click on the ball, enter, escape | `Intents` | unit | later |
| O15 | **The orb keeps its place and its turn relative to its thing, always**, except in orient mode (O12): when the thing is moved the orb goes with it; when it is turned (about the orb's middle) the orb's own axes turn with it, so what is seen from the thing does not change. | in_1457 in_439 | | `Drawing` | unit | later |
| O13 | Sticking to places while an arrow is dragged, and typed numbers for the place and turn of the orb. **later** | in_652 in_230 in_434 | | | later | later |
| O14 | A second quantity on an arrow (a copy count, a spiral's advance): the copy mode's second arrow is that; its number is typed or dragged. **later** | in_1187 in_529 | | | later | later |

## What is dropped from the old orbs
The mode chip of each tool, the section's own move icon that went through five states, the orb's separate *orient mode* (a bubble at the top, wireframe body, an apply check) and its pulsing blue, the little panes of the mover (`in_1207`), and the sheet's own three panes *across X / Y / Z* (rotate does what they did). The swapper and the three modes of the first prototype (`in_1446`), the cut plane's own *Across X / Y / Z*, *Face camera* buttons and its handle dot in the prototype are taken out: the orb moves and turns it.

## Questions (**ASK**)
1. **Extra arrows:** which operations have them, and what dragging one means for each (a copy; a count)? Left for you to specify (`in_1447`); none for now.
2. **The curved arrow** turns the thing about its own middle (the ball), the axes staying the world's. Right for now?
3. **Where the orb stands for a body or a sketch plane** (later sections): the middle of the box of what is selected; its axes the world's unless oriented (O13).

**Arrows stop short of the ball** (`in_1456`): every arrow, and each stem, begins a little way out from the ball (`settings.mover.gapShare`), so none runs into it.
