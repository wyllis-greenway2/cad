---
id: dec_relations_merged
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_1643, in_1644
date: 2026-11-26
depends_on:
  - dec_relations_standard: it is the table these two kinds are taken out of
  - q_relation_set: the audit that found them (the same rows as other relations)
alternative_to:
---
# One kind for what the person means: in line, concentric, on, tangent are not many

Approved (`in_1643`, "merge the exact duplicates first"): two kinds that were the same rows as others are gone. **In line** (two lines) is the two ends of the second on the first: two `pointOnLine`. **Concentric** (two circles) is the two centres together: `coincident` of the centres. Nothing makes them any more: trim keeps a piece in line by its two ends; two circles picked are offered `coincident` of their centres (a circle stands for its centre where a point is wanted, `suggest.ts`); two lines picked are offered no "in line" (select an end and the other line, or draw so that the helper offers it).

**Old files:** a definition that still has them is read as what they are (`modernise`, `engine/definition.ts`: used by `systemOf` and `tidy`): in line becomes `<name>` and `<name>.2` (two `pointOnLine`), concentric keeps its name as a `coincident`. Kept for good, so a saved file never stops opening. A body's rim as an anchor works the same (`<id>.c`).

**Not done yet (the other two exact duplicates of `q_relation_set`; and a decision for the human: whether to delete `equalLength`/`equalRadius` from the engine too):** a line's **length** as the **distance** of its ends, and a line's **level/upright** as that of its two ends. They reach into the typed numbers, ranges and measure bubbles (a dimension), so they are a separate step.

## The second round (`in_1644`, the human's directive)
**On a line and on a circle are one kind, `on`** (a point stays on a curve; which formula measures its distance from the curve is the curve's business: `rows` chooses by the kind of the second part). **Tangent and circles touching are one kind, `tangent`** (a line and a circle, or two circles, outside or `internal`); the helper's inside/outside variants are only for two circles. **Equal length and equal radius are not offered** ("people can just set dimensions equal by hand", `in_1644`): `RELATIONS` marks them `person: false` (no offer, not in the menu, no helper); they are **kept in the engine** for two reasons the human has not been asked about: trim makes an equal radius to keep the two arcs of a cut circle one circle, and an old file that has one must still open. **Old files:** `pointOnLine` and `pointOnCircle` read as `on`, `tangentCircles` as `tangent` (`modernise`). The icon for `on` is one (a dot on a curve); the offer reads "on L1" (`infobar.ts`).

## Rationale

The human saw that "a line on a line is two vertices on a line" and that the kinds that say the same thing twice are noise (`in_1642`). The rows of each are identical to the ones they became (checked by `dev/relations-merge-check.ts` and by the old rim-and-ring check still passing on an old-kind file).
