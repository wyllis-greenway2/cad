---
id: dec_mirror_copy
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_433
date: 2026-11-15
depends_on:
alternative_to:
---
# Mirror copy: a figure or a body copied as its reflection in a plane

`in_433` asked for a mirror copy method that works on sketches or bodies. **The AI's reading, built (for the human to correct):** *Mirror copy* is in the right-click ring beside Copy and the repeats. With a body (or one body of several) selected, or a drawn figure (corners, lines, circles, faces), a chip row offers the plane: a flat face that was selected with the body (first), the six sides of the box of what is mirrored (Left, Right, Front, Back, Bottom, Top: the copy lands against that side; not across a flat figure's own plane), and the world's three planes through the origin; Enter or the check makes it. The default is the right-hand side of what is seen. A body gets a `pattern` step with `mode: mirror` (point and normal of the plane); the kernel joins the reflection to it where they touch, else the copy is a second body. A drawn figure gets a repeat record of kind `mirror` that keeps the plane, its copies made from the original each time (they follow it, as a repeat's do; arcs are turned over so they stay the same arc). **Not built:** a plane offset by a typed distance, a selected line (for a figure) or a drawn plane as the mirror plane, mirroring in place (replacing the original), a picture of the plane before it is made.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the choice of planes is the AI's and stays provisional.
