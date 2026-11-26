---
id: dec_number_system
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1593
date: 2026-11-26
depends_on:
  - dec_dimensions_measure_then_lock: the numbers that are shown and typed are the ones of that entry (bubbles, the chip); this says in what system
alternative_to:
---
# Millimetres or inches, page-wide: the model is millimetres, only what is read and typed is converted

**The AI's proposal, not decided.** The human asked for the app to take inches or the metric system throughout, and for the cleanest, leanest way (`in_1593`). The old app did it with one small module and kept it (`app/src/shared/units.ts`, `in_661`; 15 files used it); this takes that and keeps its one rule.

**The rule.** The model is **always millimetres, exactly** (the engine, the document, every constraint's value, the files). Only what a person **reads** and **types** is converted, at the edges, by one module `next/src/units.ts` and nowhere else:
- `lengthOut(mm)`, `lengthIn(v)`, `lengthText(mm)` (a length as text: three places in mm, four in inches, trailing zeros dropped), `unitName("mm")` (is "in" while inches are in use; angles are degrees either way), and `units.system` (`"mm" | "in"`).
- **Reading:** every place that makes the text of a length asks `lengthText` (the dimension bubbles, the chip by the pointer, the operation's number, the step list's numbers, the tool tips). **Typing:** every place that takes a typed length asks `lengthIn` (the same places). Angles and counts do not pass through it.
- **Where the choice is made:** the "..." menu has one item that offers the other system ("Inches" / "Millimetres"); the choice is kept in the browser (a preference, not part of a document; opening a file never changes it).
- **No unit text** is drawn on a number (the old app's rule, `CN-40`); the tool tip names the unit.

**Why this is the lean way.** One module, three conversions, no change to the engine, the document, the checks' numbers or any constraint. A number cannot be converted twice because only the edges call it; a new number that is shown or typed is one call to add. Putting the system in the page (not in the pure descriptions) means the pure layers (`bubbles.ts`, `typing.ts`) keep giving values in mm and the checks keep reading millimetres.

**Not part of this:** the grid stays in millimetres (a display aid); fractions of an inch (1/16) are not shown, only decimals; per-document units; unit-aware typing (typing "2in" or "50mm" in either system).

## Rationale

A unit is a presentation, not part of what the model is. Keeping the model in exact millimetres means a file made in inches and one made in millimetres are the same file, nothing is rounded into it, and a switch loses nothing: the same 25.4 mm reads 25.4 or 1.0.
