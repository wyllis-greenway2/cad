---
id: dec_field_marks
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1380
date: 2026-11-20
depends_on:
  - dec_view_looks: the lit lines are the Marked look (teal over the preview)
alternative_to:
---
# The number being edited lights its lines

While a number of a gear or a model is edited in its box, the preview draws the lines of that number over the rest, thicker, in the Marked teal (`Preview.marks`; `in_1380`: the bore's edge for the bore, the spokes' edges for the spokes). Built first for **plain gears** (`gearMarks` in `interaction/tools.ts`: bore, wall, the pitch circle for the teeth, the module and the pressure angle, the tips for the shift and the addendum, the root for the dedendum, the clearance and the fillet) and for the **wheel and the cut-spokes model** (`wheelMarks3`: outside, rim inside, hub, bore, the rim's and the hub's thickness, the web, and every spoke number as the cutouts' outlines). A model gets it by giving `marks3` in its definition (`modelkinds.ts`). Not built yet: worm, bevel, rack, planetary and the other models; a number with no line of its own lights none. The stand-in discs (`standin.ts`) do not have it: they stand for a body being made and have no numbers being edited.

## Rationale

The human asked for it as a help to edit the numbers of complicated parts (`in_1380`). It is a small hook on the preview that already exists, one list of lines for each number, so that more parts can be added one at a time. It stays provisional until the human has used it and says which parts should have it next.
