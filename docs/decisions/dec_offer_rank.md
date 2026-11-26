---
id: dec_offer_rank
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1664
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

## Rationale
The human asked what to show when two or more constraints are equally viable (`in_1663`): showing all of them is clutter, and the choice that matters is between things that exclude each other, not between things that can all hold.
