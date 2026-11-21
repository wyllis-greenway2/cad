---
id: dec_mover_orb_spec
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1459, in_1446, in_1447, in_1449, in_1455, in_1456, in_1457, in_1458
date: 2026-11-21
depends_on:
  - dec_rebuild_by_requirements: the orb is a section of the rebuild, built as a prototype, then written down and tested once the human was happy with it (`in_1444`)
---
# The mover orb: the requirements are `docs/rebuild/mover_orb_requirements.md`

The human asked for one unified mover orb in place of the old app's several (`in_1446`), shaped and tuned it by hand over a series of tries (a straight arrow one side and a curved arrow the other, `in_1447`; heads on the curve, `in_1449`; the original again after other shapes were tried, `in_1455`; stopping short of the ball, orient mode and the orb staying rigid with its thing, `in_1456`, `in_1457`; choosing arrows, `in_1458`), and said he is happy with it (`in_1459`). It is specified by that file's rows: its contracts (`src/orb.ts`, `src/mover.ts`), the inputs it claims and its rows, each with its test (`test/orb.test.ts`, `test/mover.test.ts`, `test/browser/orb.browser.ts`). **Not part of it:** the info bubbles (the human will define them, `in_1459`), and everything else built beside it so far (the cut plane, the right-click ring, selecting): not yet approved.

## Rationale

The old app's orbs were many and made each rule again for each (`dec_unified_orb`); one orb with its rules written once and tested is what keeps a rule given once true everywhere. The human wanted tests only after a prototype he was happy with (`in_1444`).
