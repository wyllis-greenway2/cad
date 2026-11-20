---
id: dec_boolean_cut
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_294
date: 2026-11-14
depends_on:
  - dec_independent_bodies: the bodies that are combined are the independent bodies, named by the steps that made them
alternative_to:
---
# Boolean operations: one Combine, each part kept or tossed

The human approved (`in_294`, after `in_293`) replacing Add / Subtract / Intersect / "keep the tools" with this one action:

- **Combine bodies…** (one item; `in_298` merged Add into it, the human: "lets merge the menu on boolean subtract or add so it is just the one method"): the selected bodies are shown as the **parts they make together** (only the first, only the second, where they overlap, and so on for three or more: each part is named by the bodies it is in, `A`, `B`, `A∩B`). Each part has a control: **plus** (kept) or **minus** (tossed); a click changes it. It starts as an add (every part kept). A **button** above says whether **the kept parts are joined** into one body where they touch, or **stay separate** (also "subtract, keep the tool", and "split every body on its intersections and keep all of it": every part plus, separate; `in_298`). Enter, the tick, or a right click (a tap in free space on a phone) makes it, Esc gives it up, choosing something else gives it up. The result is shown as it would be while it is set up.

Choosing the parts covers every combination: all kept and joined is add; only the first = A minus B; only the overlap = intersect; only the two outer parts = what does not overlap (new); kept apart = the tools kept. It is **one `combine` step** (`mode: regions`, `regions`: the numbers of the kept parts, `join`) and one undo; the older steps (subtract, intersect, keep) still open in saved files, the menu no longer offers them.

Parts are offered where the bodies' boxes meet; if a part is really empty (the boxes meet, the bodies do not) choosing it changes nothing.

## Rationale

The human's idea is simpler than four menu items and says more. The case that needs an extra control, touching kept parts that must stay separate bodies, is the join toggle (`q_boolean_regions` before it was built).

## Built: regions that touch are one figure when extruded together (`in_1306`)
Selected together, regions that share a side (the two halves a line across a ring makes of it) are one figure for an extrude, a push or a cut: their shared sides are taken away and the outline that is left is followed round (the biggest loop is the outside, the others are holes) in `mergedFigures` (`interaction/operations.ts`). Before, each region was a step of its own, and the second had to meet the faces the first one left, which the kernel refused ("kernel returned an invalid solid"): only one half was cut. A group whose outline cannot be followed (a corner where more than two sides meet) is left as separate figures. Test `ringhalves.test.ts`, with the user's model as `fixtures/ring-through.cad.json`.

## Built: Boolean, a group of Add, Subtract, Intersect and Parts (`in_1320`, for review)
The human: "can we just seperate out into three types, boolean, add, subtract, and intersect?". Under Shape the Combine item is now a **Boolean** group: **Add**, **Subtract** and **Intersect** each make one plain combine step on the selected bodies (the first body chosen is the one that stays; the others are used up, `keep` off), and **Parts** is the parts picker above, kept for the cases the three cannot say (the two outer parts, parts kept apart). This reverses `in_298`'s merge of the menu into one item for the plain cases: the human asked for it. The names of the three and the group, the icons, and keeping Parts are my choices, for review.

A part a parts combine made (`x_s_198.1`) has no step of its own, so Delete did nothing: the step now records the numbers of the parts deleted (`skip`) and the kernel leaves them out of the result.
