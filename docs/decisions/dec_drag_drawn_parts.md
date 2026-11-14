---
id: dec_drag_drawn_parts
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_290
date: 2026-11-14
depends_on:
  - dec_constraint_ownership: dragging a part moves it through the solver, so the relations it is held by decide what may move
alternative_to:
---
# Dragging the parts of a drawing, and the hints a dragged point takes

The human asked (`in_290`) for the parts of a drawing to be draggable and for a dragged point to be helped as a drawn one is. Built, provisional until tried:

- **A straight line is dragged whole** (a drag that begins on it): both ends go by the same amount, the solver settles the rest. **The edge of a circle is dragged to change its size** (the radius becomes the pointer's distance from the centre). A point is dragged as before. **An arc is dragged whole too** (`in_292`): its ends and its centre go by the same amount, so it keeps its size.
- **Locks are respected:** a point that is **fixed in place** is not dragged (the move is refused with a message), so a line with a fixed end is not dragged; a circle whose **diameter is locked** does not change size (it says so). Before this, a fixed point could be dragged away.
- **A dragged point takes the hints a hover gives while drawing** (`lineHint` for an end of a line: level, upright, parallel, square, tangent, on a circle or line, as long as another line; `pointHint` for any other point such as a circle's centre: on a circle or a line), shows them while the drag goes on (the hint icons and the part lit amber), and **keeps them when it is let go**: the constraints are made in the same step as the move (one drag, one undo).
- **A selected point that is close to a circle, an arc or a line** is offered "on the circle" / "on the line" in the suggestions (`nearCurves`; before only a selected curve offered the points near it).
- **Icons:** a number's lock is a closed padlock when locked and an open one when it is a measurement; "Fix in place" is a closed padlock (it was an arrow onto a line).

- **Two circles that touch (`in_292`):** the constraint is **Tangent** for two circles (one outside the other: the distance between the centres is the sum of the radii; one inside the other: their difference; which one is taken from how they lie now; solver `tangentCircles`). It is a Tangent action for two selected circles, and a selected circle is offered "Tangent: the circle that nearly touches it" when another circle's edge is within the same small distance as the other "near" offers. The **Fix in place** padlock is open on the suggestion (offered) and closed on the constraint's bubble (made).

- **One rule for proximity (`in_294`):** any point near a line, an arc or a circle is offered "on it" (`pointHint`), whatever it is: a line's end, a circle's centre, a rectangle's corner, a point of any figure, whether it is being drawn (hover, or a tap and its drag icon on a phone) or dragged afterwards. A **line dragged whole** offers the same for its ends (an end near a line or circle lands on it) and for any vertex of the drawing near it (the vertex is put on the line). A **circle dragged by its edge or by its centre** that comes to where it touches another circle lands there and keeps Tangent. A rectangle's corners and a circle's centre drawn on something are made on it. Before, only the ends of straight lines (then arcs) had this, because the hints were first built for the line tool and each tool added its own; the centre of a circle on a phone differed only in the drawing case, which had no hint for a first point other than a line's or an arc's. The offers of constraints for a selected part count parts that are **exactly** touching as near, and use how far apart they are on the screen (a few pixels) as well as a fraction of their size.

## Rationale

Direct dragging is how a mouse user changes a drawing; the solver already keeps the relations, so a drag only needs to say which points are pinned. The hints reuse the drawing code (`hints.ts`) so a point is helped the same way however it is placed.
