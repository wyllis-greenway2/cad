---
id: dec_orb_positioning
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_603, in_610
date: 2026-11-16
depends_on:
  - dec_spiral_extrude: the orb is the revolve's axis (and the mover's); this changes how it is put where it should be, not what it does
---
# Putting the orb where it is wanted: into a plane, held to axes, and sticking to places

**What the human asked (`in_603`):** the revolve's orb is hard to position: a click on a plane should centre it in that plane; it should be movable like any other XYZ thing, Shift-choosing more than one axis to hold its drag to them (XY: that plane); and it should snap to suggested places as sketching does (alignments, centre points, coaxial points, centres of bodies).

**What is built, and the choices that were mine**
1. **A click on a plane puts the orb into it.** For a plane that is not a face of the body (a world plane, a sheet), the orb's place is brought onto the plane, **where it was across the plane left alone**: its other two coordinates stay. I read "centres in that plane" as "into that plane", since the next step is to drag it about in the plane (2 below); a click on a face of the body still puts the orb at the point clicked with its axes across the face, as before (`in_438`). If the plane's own middle was meant (the origin for a world plane), that is a one-line change.
2. **Holding the drag to axes.** A click on one of the orb's position arrows holds its drag to that axis alone (a second click frees it); **Shift** adds an axis or takes one out: one held is a line, two held the plane of the two, three is free. The message says which ("the orb moves in the XY plane only"). The arrows are the orb's **own** axes (turned with it), so "XY" means the orb's X and Y, the same axes its bubbles name; with the orb's axes along the world's they are the world's. Held, the part of the way along a held axis is kept and nothing else (`heldTo`). It is the same `lockAxes` as a body's free move; it is let go when the selection changes or something new begins.
3. **Sticking to places** (`interaction/orbsnap.ts`): the places are the corners of the drawing and of the bodies, the middles of edges, the centres of circles and arcs (so coaxial points), the middles of faces and of bodies (the middle of its box). When the pointer is within `settings.sketch.snapPx` of one the orb goes onto it (held to its axes, if held); else, along each world axis it may move along, its place is brought to the place of a corner or the like within `settings.sketch.alignPx` (so it lines up with them, as a point being drawn does); the message says what it stuck to or lined up with. The lining up is made only when the orb's axes are the world's (a turned orb snaps to places but does not line up).
4. **Tests:** `test/revolve.test.ts`: the places are found; held and free ways of moving; the corner, the lining up, and the held plane (a held drag keeps its height); Shift on the arrows (one, two, a second click frees); a click on the world XY plane puts the orb at z = 0 and leaves x and y. Looked at in the browser: Shift-click two arrows and drag the orb: the orb stays in the plane, and sticks to a corner.

**Not done:** lines drawn in the picture to show what the orb lines up with (the message says it); snapping to the middle of a body's mass (the middle of its box is used); the orb's dragging **arrows** (`piv:`) do not snap (they move along one axis by a distance); the held axes are not drawn lit on the arrows.

The number bubble that has no arrow tip to stand at (the revolve's angle and advance, at the middle of the handles) stands well off the orb, down and to the right, so it never covers an arrow or ring to be pulled (`in_610`).

## Rationale

The orb's free drag was a pointer in the view's plane with a snap to a corner only; placing it exactly meant many drags. The same ideas the human knows from moving a body (hold it to axes) and from drawing (stick to places, line up) are reused rather than made anew: `lockAxes` is the state of a free move, and the places are the ones the sketch tools offer, gathered in 3D.
