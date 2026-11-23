---
id: q_lean_ui
kind: question
status: open
origin: ai-unreviewed
human_input: in_1562
date: 2026-11-23
depends_on:
  - inv_no_logic_in_ui: the screen only draws descriptions that the interaction layer makes
---
# What is the leanest interface for the rebuild, learning from the prototype?

**Recommendation (not decided).** The screen is made of a handful of parts, each described by data and drawn by one component, and the engine's answers (statuses, refusals, trims, asks) are the only source of what they show.

**Three looks of a body (the prototype's `ui/looks.ts` has four; the human wants two or three):** *Solid* (the default grey, lit), *See-through* (the dark nearly clear look: wireframe bodies, bodies behind a plane, the stand-in of a preview) and *Marked* (a colour laid over either: teal for picked or pointed at, red for a clash or a refusal, amber for a tie). A cut section is Solid clipped by a plane (not a look of its own; the hatch is a drawing on the cut). Every place that shows a body asks for one of these three; none sets its own colour or opacity.

**Four things that stand on the screen (the human named them):**
1. **The ring** (the prototype's right-click round buttons, `ring.ts`): one component, items from data, sub-rings for the complex operations. The large "gear menu" is the same ring with more items, not another widget.
2. **The bubble**: one component that stands at a place on the model or the sketch. Constraint bubbles and dimension (number) bubbles are two contents of it; shown only on what is selected; a refusal flashes the bubble and the parts red.
3. **The helper bar** (the prototype's `suggest.ts`): opens beside what was clicked, with an offset; suggested constraints on the right, actions on that thing on the left. It is the one place a suggestion appears.
4. **The ... menu**: the one list for everything that is not in the ring (import, export, settings, history).

Plus the sketching drawing the human liked, kept as it is in `interaction/style.ts` (dashed teal suggestion lines, teal picked, red flashing refusals, green applied).

**What leaves:** the prototype's nine ways to show a message and fifteen kinds of pill (`dec_ui_unification`) become the one bubble and a line at the bottom; the five kinds of handle become the mover (the next section, `mover_orb_requirements.md`).

**How:** the interaction layer makes a list of descriptions each frame (what to draw where, with which look and tone); the screen has one function per part and no knowledge of CAD. Order: looks, bubble, ring, helper bar, ... menu, wired to the engine's sketch and trim.

## Rationale

The prototype's polish came from the human's feedback and is worth keeping; its mess came from a widget per feature. One description and one drawer per part keeps both.

## Progress (`in_1563`: the human said to start with the looks and the bubble, and that click to trim is fine)
- **Looks built:** `src/looks.ts` (Solid, See-through, a mark: pick, clash, tie; numbers in `settings.looks`), and `world.ts` sets a body's colour and opacity only through it (`Drawing.looks`, by body id; `theme.bodyColor` is gone).
- **Bubble built:** `interaction/bubbles.ts` (the descriptions, from the solver's system and the selection; `retype` for a typed number), `bubbledraw.ts` (the one drawer), `interaction/bubbleplace.ts` (the prototype's placement, ported unchanged), the constraint icons ported to `icons.ts`. A constraint is shown when one of its parts is selected.
- **Try it:** `?bubbles=1&boxes=3` (`bubbledemo.ts`): click a part, type a number, an impossible number flashes the bubbles that hold it red. Checked by `dev/looks-bubbles-check.ts` and, in the page, `dev/bubble-browser.ts`.
- **Not yet:** the drawing tools make figures, not the engine's points and lines; the sketch controller moves onto the engine's definition next, and trim (a click on the piece) comes with it. Ring, helper bar and "..." menu are as before.
