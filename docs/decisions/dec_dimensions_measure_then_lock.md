---
id: dec_dimensions_measure_then_lock
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1589
date: 2026-11-26
depends_on:
  - dec_hints_place_only: a typed number is the one thing besides a click that places a point; it does not make hints into constraints
  - dec_helpers_one_rule: the same relation table and the same free place (`~P`, `~L`, `~C`) carry the numbers of a figure being drawn
alternative_to:
---
# Dimensions: one number, measured then locked, typed as you go

**The AI's proposal, not decided.** The human liked how the old app handled dimensions, "you could generally just type dimensions as you go and it felt really smooth" (`in_1589`), and asked how to capture it cleanly and lean. This also answers the dimension half of `q_sketch_grid_and_dimensions` the old app's way, if approved.

**What the old app does (read in `app/src`: `interaction/entry.ts`, `tools.ts`, `control/modal.ts`, `ui/bubbles.ts`; pictures in `docs/rebuild/look/prototype`).**
- While a figure is drawn a **chip stands by the pointer** with its live numbers (rectangle: width and height, circle: diameter, line: length, arc: height), each with an open padlock. **Digits are typed straight into it** (no key to press first); Tab goes to the next number; a typed number overrides the pointer for that size (a typed width keeps the side the pointer is on); Enter makes the figure.
- A selected part shows its **measured numbers** with an open padlock (a side's length, a circle's diameter, an angle between two sides, a distance between two corners). Clicking the padlock locks it at what it measures now (a constraint); again, it is live again. **Typing digits with a part selected** types into its number; Enter locks it (`dec_typing_standard`, the table of what is typed into what).

**The rule.**
1. **A dimension is one thing: a measure of parts that is live or locked.** It is a dimension relation of the engine's table (`length`, `radius`, `distance`, `horizontalDistance`, `verticalDistance`, `angle`, `pointLineDistance`) over parts. *Live* means no constraint exists (the number is read from the sketch); *locked* means the constraint is there (the padlock is closed). Nothing else is stored: the padlock is whether the constraint exists, and `suggest.ts` `offersFor` already gives the dimension offers with what they measure now.
2. **After a figure is made**, a selected part shows its measured numbers as bubbles with an open padlock, locked ones closed; the bar's ruler button goes away (the number is already there). Clicking the padlock locks or unlocks; clicking the number types a new one and locks it; digits typed with a part selected go to its number (`dec_typing_standard`).
3. **While a figure is drawn** the same numbers are shown for the figure to be, in the chip by the pointer: each tool names its measures once, as a list of dimension relations over its free parts (`~S`, `~P`, `~L`, `~C` of `dec_helpers_one_rule`): rectangle: `horizontalDistance` and `verticalDistance` of its corners, line: `length`, circle: `radius` shown as a diameter, arc: `radius`. Digits go to the active number, Tab changes it, a typed number locks it.
4. **A typed number places the figure through the solver, not through a rule per tool.** The figure's free place is solved with the typed dimensions as constraints and the pointer as a soft pin (the same way a drag is solved): the answer nearest the pointer is the answer, so a typed width keeps the side the pointer is on, a typed length goes along the pointer's direction, a typed diameter overrides the pointer, with no code for any of them. A helper does not act on a size that is typed (a typed number is stronger than a helper).
5. **Enter or a click makes the figure with the typed numbers as locked dimensions**; the numbers not typed stay live (open padlock) and are only measured.

**Slices, each small and checked on its own:** (a) the measured bubbles with a padlock for a selection, and typing into them; (b) the chip while drawing, fed by the tool's measures and the solver; (c) diameter and angle shown as the old app shows them, units.
**Not decided / not built:** an inch display (`CN-40`); a number on a body's edge (`CN-44`); an arc's angle (`CN-9`).

## Rationale

The old app built the typing of numbers once for each tool, once for selected parts and once for bubbles (`tools.ts`, `modal.ts`, `ui/bubbles.ts`: about a thousand lines in `interaction/`). The engine already states every dimension once (a relation with exact residuals, a value, a range) and already solves a free part toward the pointer; so one idea, a measure that is live or locked, covers the chip, the bubble, the padlock and the typing, and the figure being drawn is the same thing as a figure that is made, only with its free parts still moving.
