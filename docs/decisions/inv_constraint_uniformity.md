---
id: inv_constraint_uniformity
kind: invariant
status: accepted
origin: human
human_input: in_1086
date: 2026-11-19
depends_on:
  - dec_relations_standard: the constraints and mates the rule is about are the relations of that standard
  - dec_standing_mates: a mate that cannot hold is a violated constraint like any other
alternative_to:
---
# Two rules for constraints, with no exceptions

The human (`in_1086`: "I constantly find exceptions"): **1. A violated constraint always behaves the same:** an attempt to break a constraint (by any channel: a drag, a typed number, a tool, a push or pull, a move, a mate, an edit of a gear or a sketch) **flashes red, says so in words, and offers to delete the constraint** (`session.conflict` with `victims`; the notice's button: "Delete constraint to proceed" when there is a change to go on with, "Delete constraint" when the change stays). **2. Whatever is selected that can have constraints is always offered them** in the suggester, like Select similar: the sketch parts (as before) **and the faces and circular edges of bodies and the world's planes (the mates that fit)**: a pin's wall and a hole's wall are offered a coaxial mate.

**Checked in review:** a new way to refuse a change that blames a constraint must set `conflict` with the constraints as `victims`; a new kind of selection that the Constraints ring gives actions for must be offered them by the suggester (`interaction/suggest.ts` asks `actionsFor`, so a new relation row or mate is offered by itself once the selection is one the suggester accepts). The tests `suggestmates.test.ts` and the last test of `gizmo.test.ts` hold both.

## Rationale

The human's own words. A rule with exceptions has to be learnt case by case; one without needs nothing remembered.
