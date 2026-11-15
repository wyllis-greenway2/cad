---
id: dec_mirror_copy
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_433, in_437
date: 2026-11-15
depends_on:
alternative_to:
---
# Mirror copy: a figure or a body copied as its reflection in a plane

`in_433` asked for a mirror copy method that works on sketches or bodies. **`in_437` (replaces the row of plane buttons):** *Mirror copy* is the mover's own arrows. With a body (or one body of several) or a drawn figure selected, an arrow along each axis stands in the middle of what is mirrored and ends at the plane across that axis; a small plane is drawn for the arrow that is chosen (the body goes wireframe so the plane shows inside it) and the mover's orb pulses where the arrows start. Taking an arrow chooses the plane across it; pulling it, or typing its number (where the plane stands along the axis), moves the plane. It begins with the plane at the far side of what is mirrored on the axis the view looks across (a face selected with the body that faces along an axis takes that axis and its place), so the copy lands against it; Enter or the check makes it. A body gets a `pattern` step with `mode: mirror`; the kernel joins the reflection where they touch, else it is a second body. A drawn figure gets a repeat record of kind `mirror` that keeps the plane (its copies follow the original; arcs are turned over). **Not built:** the orb placing the plane's anchor, the mirror plane at a slant (the mover oriented), a selected line as the plane for a figure, mirroring in place, a figure's own plane as an axis arrow.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the choice of planes is the AI's and stays provisional.
