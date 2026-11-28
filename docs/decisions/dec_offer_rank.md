---
id: dec_offer_rank
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1664, in_1665
date: 2026-11-26
depends_on:
  - dec_helpers_one_rule: what is a candidate at all (a relation that is applicable, in reach and that the solver would accept) is still that rule; this entry only says which of the candidates are shown
  - dec_apply_one_moves: the movement an offer is ranked by is the one applying it makes
alternative_to:
---
# Which near offers are shown when several are viable

Approved (`in_1664`, "yes build it", of the AI's proposal at `in_1663`): the near offers of a selection (not a picked pair, not what is already true) are **ranked by how little applying them moves**, the movement being the real one from the apply (`planOf`, the sum of the arrows):
1. **Alternatives for one decision keep the best.** Offers with the same other part (or all with the selection alone) cannot be both wanted: the one that moves least is shown; a **real toss-up** (the next is within a quarter of the best) shows both.
2. **A relation that says more beats the one it implies:** a point put on a line or at its middle loses to the point coincident with one of the line's ends; two points level or upright lose to their being coincident (when that is offered at all).
3. **Independent offers** (different other parts) are shown **smallest movement first, at most three**; ties are broken by a fixed order: tangent, coincident, on line, midpoint, square, parallel, level, upright. The rest are in the menu.
Unchanged: a picked pair shows everything that fits it; what is already true of one part shows; an offer that would move any part by more than twice the reach is not near (`in_1652`).

**The numbers are the AI's** (a quarter for a toss-up, three shown, the order): `TOSS_UP`, `NEAR_SHOWN`, `PRIORITY` in `interaction/marks.ts` (`rankNear`). Before this the near offers were at most two, one per other part round-robin, with no ranking by movement and no notion of one implying another.

## One movement distance (`in_1665`)
The human liked one rule: **an offer is shown when applying it moves nothing by more than one distance**, for every relation alike (a level, a tangent, an on-line). Built: `settings.helpers.offerPx` (12 px) turned into mm at the zoom is the one distance; it is never more than a tenth of the size of what is selected (a circle's radius, a line's length), so zooming out adds none; the candidates are still found by `inRange` over the selection's own motion at that distance, and then every offer is cut by what its apply really moves (`marks.ts`: no arrow longer than the distance). Before: 12 px for a relation that says a point, 6 px for one that says a line, a tenth and a twentieth of the size, and twice the reach for the knock-on. The drawing and dragging helpers keep their own reach (`pointPx`, `linePx`: a different question, where the pointer is). The distance and the tenth are the AI's numbers.

## Rationale
The human asked what to show when two or more constraints are equally viable (`in_1663`): showing all of them is clutter, and the choice that matters is between things that exclude each other, not between things that can all hold.
