---
id: dec_arc_angle
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_463
date: 2026-11-15
depends_on:
alternative_to:
---
# An arc has an angle as well as a radius

`in_463` asked that an arc can be given both its radius and its arc angle, with the lines from its centre drawn dashed when it is selected so the angle mark can be drawn. **The AI's reading:** a relation kind `arcAngle` (row *Arc angle*, one part, an arc with a centre, degrees): the angle between the line from the arc's centre to its start and the one to its end, taken the way the arc goes from where it is now (the solver's signed `angle` constraint, so over 180° too); the radius stays the distance from the centre to the start. A selected arc shows two numbers, its radius (`R`) and its angle (`∠`), the second as a measure that can be typed over (`measure:arcAngle`, which makes the constraint); with the numbers its two radial lines are drawn dashed and a little arc between them marks the angle (`Annotation.dashed`). A constraint that is already there shows its own number and marks the same way.

**Not built:** a number at the moment the arc is drawn (the arc tool still gives the numbers when it is selected, as the radius was); a tangent-to-both-ends arc made from radius and angle; the two numbers typed together.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
