---
id: q_boolean_regions
kind: question
status: open
origin: ai-unreviewed
human_input: in_293
date: 2026-11-14
depends_on:
alternative_to:
---
# Boolean operations as "keep or toss each part" (add, and subtract by picking parts)

The human asked (`in_293`) whether Add and Subtract are enough, if Subtract is done by clicking a plus or a minus on each part (each body and each overlap) to keep or toss it, and whether Intersect would still be needed. Nothing is built; the analysis:

- Two overlapping bodies A and B make **three parts**: A only, the overlap, B only. Choosing which of the three to keep covers **every** result: all three kept = **add** (one clump); A only = A minus B; B only = B minus A; the overlap alone = **intersect**; A only and B only = the pieces that do not overlap (the "exclusive or", which the menu does not offer today). So **Intersect does not need to be separate**: it is "keep the overlap only".
- With three or more bodies the parts multiply (up to seven for three bodies), but only parts that exist are shown; the same picking applies.
- One thing is **not** covered by choosing parts alone: **"subtract but keep the tool"** (A minus B, and B kept as its own body). The kept parts that touch merge into one body, so A only and (the overlap + B only) would become one. It needs a second choice: **keep the kept parts as separate bodies, or join them** (a toggle). With that toggle the picking covers everything the menu has today.
- Add stays one action ("join what is selected"); it is the same as keeping every part and joining.

Proposal (to be approved): replace Add / Subtract / Intersect / Subtract keeping the tools with **Add** and **Cut**; Cut shows the parts of the selected bodies as pieces with a plus and a minus each (everything starts kept, a click tosses a part), and a toggle "join" / "keep separate".

## Rationale

The human's idea is sound and simpler than the current menu; the one case it needs an extra control for is keeping separate bodies that touch. No code depends on this; the combine step (`combine`: add, subtract, intersect, keep) already exists and would be built on by this.
