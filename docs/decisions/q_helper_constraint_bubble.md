---
id: q_helper_constraint_bubble
kind: question
status: open
origin: ai-unreviewed
human_input: in_1581
date: 2026-11-25
depends_on:
  - dec_hints_place_only: a helper only places; a constraint is made when it is asked for, and a click on the bubble is asking
  - dec_helpers_one_rule: the helpers that held are the constraints the bubble offers
alternative_to:
---
# Offer the constraint a helper held, for a moment, as a bubble?

The human's idea (`in_1581`): since a helper is a constraint that nearly held, show it as a constraint bubble with a question mark for a moment after the place is made; a click before it fades makes the constraint (the bubble turns to a green check and fades); a selected part always shows its constraints.

**AI's recommendation (not decided):** yes, as one rule on the bubble layer that exists: a part shows the constraints it holds or could hold as bubbles **always while selected**, and **for about 4 seconds after it was made** for the helpers that held when it was placed (open, question mark; the timer stops while the pointer is over a bubble). A click makes the constraint through the same relation row (`constrain`), as a change of its own (undo takes it back), shows the green check, and fades; the solver refusing it shows the red the bubbles already have. Cautions: the bubble sits beside the new point and never under the pointer, so the next click of a chain does not land on it; touch has no hover, so the bubble stays a little longer there; a Shift-click that places *with* the held constraint is a quicker way for those who know what they want (separate, later).

## Rationale

Keeps `dec_hints_place_only` (nothing is made unasked) and removes its cost, that making a constraint needed selecting the part and finding it in the bar.
