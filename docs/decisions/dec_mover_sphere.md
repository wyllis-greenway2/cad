---
id: dec_mover_sphere
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_416, in_417, in_418
date: 2026-11-15
depends_on:
alternative_to:
---
# The mover's sphere: where the mover stands, set apart from moving the body

`in_416` asked for a sphere at the junction of the move arrows (as the turn tool has), whose position is where the mover measures from and turns about, that can be put on a vertex, an edge or a face or moved freely, with its own arrows in the turn tool; and for a mover that always shows both the arrows and the rings and, with the sphere selected, uses them to orient the mover itself (its arrows move it, its rings turn its axes). **The AI's reading, built so far (for the human to correct):** both tools have the sphere; a click on it selects it (a second click lets it go); selected, its own arrows (`piv:x/y/z`) are up (in the move tool they take the place of the body's arrows, in the turn tool they come with the rings) and move the mover, not the body; a vertex, the point of an edge, or the point of a face clicked puts the mover there; a turn is about the mover's place, and a move's arrows stand at it. **Orientation (`in_417`, built):** with the sphere selected its rings (`rot:`) turn the mover's own axes (`Op.frame`, three unit vectors) and its arrows move it; a face clicked puts the mover's Z along the face's outward normal, a straight edge its X along the edge. With the sphere let go, the arrows pull the body along the mover's turned axes (a `move` step by a vector, `vx,vy,vz`) and the rings turn the body about them (a `rotate` step with a direction, `dx,dy,dz`, through the kernel, the history, the view's motions and a figure's turns). A typed turn of a turned mover is one angle about its X, Y or Z. **The rest (`in_418`, built):** the mover shows its arrows and its rings together in both tools (the ball too); the one of the other tool taken, by a drag or a click, turns the tool about (keeping the mover's place and axes); until a turn is begun a click on a ring goes to what is under it (the rings stand about the whole body and would hide its points and faces). With the sphere selected its place is three fields, the world x, y, z, on its arrows; typing one moves the mover (nothing is made). A body pressed on and dragged free while a mover is open goes along the mover's axes (all three, or the ones chosen), and the mover stays open after. A figure turned about the mover's slanted axis ends where the exact turn puts it (checked to 1e-4 mm; the turn is made as three world turns, which is exact). **Not built:** the numbers of a free drag of a turned mover read in world x, y, z (not along its axes). Not browser-checked.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
