---
id: dec_mover_sphere
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_416, in_417
date: 2026-11-15
depends_on:
alternative_to:
---
# The mover's sphere: where the mover stands, set apart from moving the body

`in_416` asked for a sphere at the junction of the move arrows (as the turn tool has), whose position is where the mover measures from and turns about, that can be put on a vertex, an edge or a face or moved freely, with its own arrows in the turn tool; and for a mover that always shows both the arrows and the rings and, with the sphere selected, uses them to orient the mover itself (its arrows move it, its rings turn its axes). **The AI's reading, built so far (for the human to correct):** both tools have the sphere; a click on it selects it (a second click lets it go); selected, its own arrows (`piv:x/y/z`) are up (in the move tool they take the place of the body's arrows, in the turn tool they come with the rings) and move the mover, not the body; a vertex, the point of an edge, or the point of a face clicked puts the mover there; a turn is about the mover's place, and a move's arrows stand at it. **Orientation (`in_417`, built):** with the sphere selected its rings (`rot:`) turn the mover's own axes (`Op.frame`, three unit vectors) and its arrows move it; a face clicked puts the mover's Z along the face's outward normal, a straight edge its X along the edge. With the sphere let go, the arrows pull the body along the mover's turned axes (a `move` step by a vector, `vx,vy,vz`) and the rings turn the body about them (a `rotate` step with a direction, `dx,dy,dz`, through the kernel, the history, the view's motions and a figure's turns). A typed turn of a turned mover is one angle about its X, Y or Z. **Not built:** both tools' handles always showing together (still two tools with the switch icon), typing the mover's place, a free drag along the turned axes, an exact figure turn (drawn figures turn by Euler angles). Not browser-checked.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
