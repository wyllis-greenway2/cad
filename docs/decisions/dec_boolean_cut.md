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
# Boolean operations: Add, and Cut by keeping or tossing the parts

The human approved (`in_294`, after `in_293`) replacing Add / Subtract / Intersect / "keep the tools" with two actions:

- **Add bodies**: the selected bodies become one body (as before).
- **Cut bodies…**: the selected bodies are shown as the **parts they make together** (only the first, only the second, where they overlap, and so on for three or more: each part is named by the bodies it is in, `A`, `B`, `A∩B`). Each part has a control: **plus** (kept) or **minus** (tossed); a click changes it. It starts as a subtract (only the first body's part kept). A control above says whether **the kept parts are joined** into one body where they touch, or **stay separate** (this is "subtract, keep the tool"). Enter, the tick, or a right click (a tap in free space on a phone) makes it, Esc gives it up, choosing something else gives it up. The result is shown as it would be while it is set up.

Choosing the parts covers every combination: all kept and joined is add; only the first = A minus B; only the overlap = intersect; only the two outer parts = what does not overlap (new); kept apart = the tools kept. It is **one `combine` step** (`mode: regions`, `regions`: the numbers of the kept parts, `join`) and one undo; the older steps (subtract, intersect, keep) still open in saved files, the menu no longer offers them.

Parts are offered where the bodies' boxes meet; if a part is really empty (the boxes meet, the bodies do not) choosing it changes nothing.

## Rationale

The human's idea is simpler than four menu items and says more. The case that needs an extra control, touching kept parts that must stay separate bodies, is the join toggle (`q_boolean_regions` before it was built).
