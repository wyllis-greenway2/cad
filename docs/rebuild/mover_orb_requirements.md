# The mover orb: the requirements

Status: **the orb is accepted** (`in_1459`: "I am happy with the orb now"; see `dec_mover_orb_spec`). The info bubbles are **not** specified yet: the human will define them later (`in_1459`), so none is built and row O7 waits. Nothing else built on top of it (the cut plane, the ring, selecting) is approved; the orb is only *shown on* a cut plane at present. The brief is `in_1446` and the steering inputs after it (`in_1447` to `in_1458`); the rest is read from the old app's orb decisions (`dec_unified_orb`, `dec_mover_sphere`, `dec_orb_positioning`), whose many separate orbs are made one here. Tests were written once the human was happy with it (`in_1444`).

How to read a row: as in `world_view_requirements.md` (Inputs, Contracts, Test kind `unit` / `browser` / `hand` / `later`, Status).

## The orb
One orb for everything that is moved, **with no modes and no swapper**. From a ball at the middle, on each of X, Y, Z: **a straight arrow out one side** (it moves along the axis) **and a curved arrow out the other** (it turns about the axis): a stem along the axis to the middle of an open circle (about 280°) round it, with a head. Every arrow and stem begins a little way out from the ball. An arrow's head stands on the curve where the head begins, pointing the way the curve goes there. A second arrow beyond the end of each straight one exists only for an operation that has it (off unless the operation says; which operations is to be specified later). The ball, clicked, orients the orb (orient mode).

## Contracts of this section
- `Orb` (`src/orb.ts`): the handles, which one the pointer is at, and what a drag of one means (pure).
- `Mover` (`src/mover.ts`): which arrows are chosen, and what a drag does to the thing and to the orb's own place and axes (pure).
- `OrbControl` (`src/orbcontrol.ts`): the controller: presses, drags and keys on the orb into changes of the thing it stands for; it knows nothing of what the thing is (the host says).
- `Intents` (`src/input.ts`): `grab`, `grabMove`, `grabEnd` (a press that takes a handle is the handle's, not the view's).
- `Drawing` (`src/world.ts`): gains the orb's handles, which are lit, and whether it is being oriented; the orb is drawn by `src/orbdraw.ts`.
- `settings` (`src/settings.ts`): groups `mover`, `orb`, `theme`.

## Inputs this section claims
- mouse: left press on a handle of the orb; left-drag of a handle; shift+left press on an arrow; left click on the ball
- keys: shift while pressing an arrow; escape lets go of chosen arrows or puts the orb back; enter keeps an orient

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| O1 | There is **one orb**, made by one function (`handlesOf`) and drawn, hit-tested and dragged by one piece of code, for everything that is moved (a cut plane now; bodies, sketch planes, mirrors, repeats later). Its arrows follow its own axes: the world's unless it has been oriented (O12). | in_1446 in_1181 | | `Orb` | unit | built |
| O2 | **The straight arrows:** three, along +X, +Y, +Z, from the ball; dragging one moves along that axis by how far the pointer goes along it (the point on the axis nearest the pointer's ray) and only along it; dragging the ball moves freely in the plane across the view. | in_1447 in_117 in_1181 | left-drag of a handle | `Orb`, `Intents` | unit | built |
| O3 | **The curved arrows:** on the other side of each axis from its straight arrow, a stem along the axis to the middle of an open circle (about 280°) round it, with one head for the way; dragging one turns about that axis, through the ball, by the angle the pointer goes round (measured in the plane through the ball across the axis). | in_1447 in_1448 in_1449 in_117 | left-drag of a handle | `Orb`, `Intents` | unit | built |
| O4 | **Second arrows** (`extras`) stand beyond the end of each straight arrow only for an operation that asks for them; **off by default**; the user cannot switch them. Dragging one makes a copy and takes the copy along. | in_1447 in_1187 | left-drag of a handle | `Orb` | unit | built |
| O5 | There is no mode and no swapper: the orb is always this one shape (the three modes of the first prototype were dropped). | in_1447 | | `Orb` | hand | hand |
| O6 | **Choosing arrows:** a press on an arrow chooses it (and lets the others go); Shift adds a straight arrow to the straight ones chosen or takes a chosen one out; a curved arrow is chosen alone; a press on a chosen arrow keeps them all. Chosen arrows are lit teal and stay chosen until Esc, or the orb or the selection goes. A drag of a chosen straight arrow moves on **all the chosen arrows together**: one is a line, two the plane of the two (the third never moves), three free (in the plane across the view). | in_652 in_1181 in_1207 in_1458 | left press on an arrow, shift+left press on an arrow, escape | `Orb`, `Mover` | unit | built |
| O7 | **Info bubbles** on the chosen arrows (what they say and where they stand). **Not specified yet: the human will define them** (`in_1459`); none is built. | in_1459 in_1181 in_1183 | | | later | later |
| O8 | The orb is **the same size on the screen wherever it is** (a share, 0.11, of the view's distance to it) and is drawn on top of the model. | in_1446 in_117 | | `Orb`, `settings.mover` | unit | built |
| O9 | A press on a handle is the orb's: it does not orbit, pan or click the view; a press anywhere else is the view's as before. The pointer over a handle shows a grab cursor and lights it. | in_1446 | left press | `Intents` | browser | built |
| O10 | The pointer takes the handle nearest it within 12 px (the ball a little more easily, it being small), and nothing when it is farther. | in_117 | hover | `Orb` | unit | built |
| O11 | The orb is shown for the thing it moves when that is selected and asked for (for a cut plane at once when it is made, and by the *Orient* button of its controls, which puts it away with the same button). The orb never changes what is selected. | in_1446 in_1442 | | `Drawing` | browser | built |
| O12 | **Orient mode** (`in_1456`, from the old app's `in_421`, `in_437`, `in_439`): a click on the ball (a press that does not move) makes it **pulse blue** and puts the orb in orient mode: a bar at the top says *Orient the mover* with a check and a cross; the straight arrows now move **the orb itself** and the curved arrows turn **its own axes**, about the ball, and **the thing it stands for does not move**; a corner, a line or a face clicked puts the orb there (a face also lays its axes along the face). Enter, the check or a click on the ball again keeps it; Esc or the cross puts it back as it was when orienting began. | in_1456 in_417 in_421 in_439 | click on the ball, enter, escape | `Orb`, `Mover`, `Intents` | unit | built |
| O13 | **The orb keeps its place and its turn relative to its thing, always**, except in orient mode: when the thing is moved the orb goes with it; when it is turned (about the orb's middle, which stays where it is) the orb's own axes turn with it, so what is seen from the thing does not change. | in_1457 in_439 | left-drag of a handle | `Mover` | unit | built |
| O14 | Every arrow and each stem begins a little way out from the ball (`settings.mover.gapShare`), so none runs into it. | in_1456 | | `Orb`, `settings.mover` | unit | built |
| O15 | The look: charcoal lines 2.2 px wide at 60 % opacity, small heads, a charcoal ball; teal when pointed at, dragged or chosen (the old app's numbers, `settings.mover`). | in_117 in_1446 | | `settings.mover` | hand | hand |
| O16 | Typed numbers for the orb's place and turn, and for a drag. **later** | in_230 in_434 | | | later | later |
| O17 | Sticking to places while an arrow is dragged (a corner, the middle of an edge or a face), and a click on the orb selecting it for placing. **later** | in_652 in_1182 | | | later | later |
| O18 | Which operations have second arrows (O4), and what dragging one means for each (a copy, a count, a spiral's advance). **To be specified by the human.** | in_1447 in_1187 in_529 | | | later | later |

## What is dropped from the old orbs
The mode chip of each tool; the section's own move icon that went through five states; the little panes of the mover (`in_1207`) and the sheet's three panes *across X / Y / Z*; the orb's old separate orient mode bubble and wireframe (its pulse and its apply and cancel are kept, O12); the three modes, the swapper, the star of arrows, C-shaped arrows round the axes and a curved arrow out of each tip (all tried and dropped, `in_1446` to `in_1455`).

## Not decided (for the human)
Where the orb stands for a body or a sketch plane (later sections): the middle of the box of what is selected, its axes the world's unless oriented.
