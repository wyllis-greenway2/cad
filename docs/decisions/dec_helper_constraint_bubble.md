---
id: dec_helper_constraint_bubble
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1581, in_1582, in_1587
date: 2026-11-25
depends_on:
  - dec_hints_place_only: a helper only places; a constraint is made when it is asked for, and a click on the bubble is asking
  - dec_helpers_one_rule: the helpers that held are the constraints the bubble offers
alternative_to:
---
# The constraint a helper held is offered for a moment as a bubble

The human's idea (`in_1581`), approved with the AI's shape (`in_1582`): a helper is a constraint that nearly held, so after a figure is placed the helpers that held at its place are offered as constraint bubbles with a question mark; a click before they fade makes the constraint (the bubble turns to a green check and fades); a selected part always shows its constraints.

**The rule.** A figure placed with helpers holding gives **offers**: each is a constraint (the relation, its free parts named for real) that would be kept by the solver and is not already said. An offer shows as a bubble on the part, an icon with a question mark and a dashed amber border, for **4 seconds** (it waits while the pointer is on a bubble; it fades over the last 0.7 s). A click makes the constraint as a change of its own (undo takes it back), the bubble shows a green check for 0.9 s and fades; the solver refusing it says why, in the red the bubbles already have. An offer goes when the sketch changes (the next figure, a drag, undo), and when the tool is put away. A selected part shows its constraints as always (`bubbles.ts`). Nothing is made unasked.

**Built (`in_1582`, split out `in_1587`):** `interaction/helpshow.ts` `offersFrom`, `interaction/offers.ts` (the offers as a value: `newOffers`, `takeOffer`, `offerBubbles`; checked without a page by `dev/offers-check.ts`; `sketchcontrol.ts` keeps the value), `bubbledraw.ts` (the offer look, `hovered`), `bubbles.ts` (`offer`, `fade`); checked in the page by `dev/offer-browser.ts`. **Not built:** a Shift-click that places with the constraint; a longer stay on touch (touch has no hover: it uses the same 4 s); offers for a dragged point.

## Rationale

Keeps `dec_hints_place_only` (nothing is made unasked) and removes its cost: making a constraint needed selecting the part and finding it in the bar.
