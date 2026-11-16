---
id: q_worm_gears
kind: question
status: open
origin: ai-unreviewed
human_input: in_572, in_571, in_570, in_569, in_568, in_567
date: 2026-11-16
depends_on:
alternative_to:
---
# Worm gears: a worm, and a throated wheel as a loft through sections

**Asked (`in_567` to `in_572`):** why not worm gears, since a worm is a rack wound round an axis; whether a throated wheel can be a loft through turned gear outlines (the middle one smaller); how slow the exact way (hobbing) is; how the loft compares; and whether it is accurate enough. Nothing is built; the prototypes (`prototypes/worm-hobbing`, `prototypes/worm-wheel-loft`, `prototypes/helical-feasibility`) answer the questions.

**What was found.**
- **The worm** is a core and a thread: the rack tooth of the axial section carried along a helix (the existing Revolve with an advance, `dec_spiral_extrude`), one copy a start. Made in about 0.5 s in the benchmark; not yet through the app's own steps.
- **The wheel the exact way** (cutting the worm out of a blank at 24 turns): 153 s for one window of a 30-tooth wheel (about 15 minutes for the whole wheel), each cut slower than the last. Too slow.
- **The wheel as a loft** through 5 sections worked out from the worm: the loft is made in about 1 s and follows the exact wheel to about 0.05 mm (worst), 0.009 mm on average; its overlap with the real worm solid is under 0.07 mm3. 3 sections are four times worse, 9 no better. The sections themselves took 25 s for 5 in the prototype (a brute-force scan); they have to be made fast for a tool to use them.

**Proposal (not decided).** (1) The worm as a gear kind (starts, axial module, pressure angle, length, core, bore) made of its core and the thread step. (2) The wheel as a loft through 5 sections, the sections worked out in closed form or by a coarse grid with a local search, mated to the worm at the centre distance of the worm's pitch radius and the wheel's. (3) A check against the worm by the kernel's intersection, in tests. Single start, 90 degree shafts, one hand first.

**Open:** whether to build it; whether the sections can be made in a second or two; how a worm and a wheel are placed on perpendicular axes (the gear meshing helper handles parallel shafts only).

## Rationale

Kept as a question (nothing is approved): the answers above are measurements of prototypes of one worm and one wheel, not a tested tool.
