---
id: dec_mover_sphere
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_416
date: 2026-11-15
depends_on:
alternative_to:
---
# The mover's sphere: where the mover stands, set apart from moving the body

`in_416` asked for a sphere at the junction of the move arrows (as the turn tool has), whose position is where the mover measures from and turns about, that can be put on a vertex, an edge or a face or moved freely, with its own arrows in the turn tool; and for a mover that always shows both the arrows and the rings and, with the sphere selected, uses them to orient the mover itself (its arrows move it, its rings turn its axes). **The AI's reading, built so far (for the human to correct):** both tools have the sphere; a click on it selects it (a second click lets it go); selected, its own arrows (`piv:x/y/z`) are up (in the move tool they take the place of the body's arrows, in the turn tool they come with the rings) and move the mover, not the body; a vertex, the point of an edge, or the point of a face clicked puts the mover there; a turn is about the mover's place, and a move's arrows stand at it. **Not built:** the mover's *orientation* (the rings turning the mover's axes, the arrows then pulling along the oriented axes, a body turned about an oriented axis: a rotate step with an arbitrary axis is not in the kernel, the history, the motions the view uses or the figures' turns yet), both tools' handles always showing together (the arrows and the rings are still two tools with the switch icon), typing the mover's place.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
