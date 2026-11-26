---
id: dec_relations_merged
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1643
date: 2026-11-26
depends_on:
  - dec_relations_standard: it is the table these two kinds are taken out of
  - q_relation_set: the audit that found them (the same rows as other relations)
alternative_to:
---
# In line and concentric are not kinds of relation

Approved (`in_1643`, "merge the exact duplicates first"): two kinds that were the same rows as others are gone. **In line** (two lines) is the two ends of the second on the first: two `pointOnLine`. **Concentric** (two circles) is the two centres together: `coincident` of the centres. Nothing makes them any more: trim keeps a piece in line by its two ends; two circles picked are offered `coincident` of their centres (a circle stands for its centre where a point is wanted, `suggest.ts`); two lines picked are offered no "in line" (select an end and the other line, or draw so that the helper offers it).

**Old files:** a definition that still has them is read as what they are (`modernise`, `engine/definition.ts`: used by `systemOf` and `tidy`): in line becomes `<name>` and `<name>.2` (two `pointOnLine`), concentric keeps its name as a `coincident`. Kept for good, so a saved file never stops opening. A body's rim as an anchor works the same (`<id>.c`).

**Not done yet (the other two exact duplicates of `q_relation_set`):** a line's **length** as the **distance** of its ends, and a line's **level/upright** as that of its two ends. They reach into the typed numbers, ranges and measure bubbles (a dimension), so they are a separate step.

## Rationale

The human saw that "a line on a line is two vertices on a line" and that the kinds that say the same thing twice are noise (`in_1642`). The rows of each are identical to the ones they became (checked by `dev/relations-merge-check.ts` and by the old rim-and-ring check still passing on an old-kind file).
