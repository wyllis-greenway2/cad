---
id: dec_gear_islands
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1054
date: 2026-11-19
depends_on:
  - dec_gear_tool: a gear is made from its own record, so what is made for it needs nothing of the other bodies; a gear that was made to cut another body would need the one chain
  - dec_independent_bodies: gears are bodies that stand beside the others, which is what lets their steps be a chain of their own
  - dec_stable_references: the names of the faces and bodies of a gear are the same in a chain of its own and in the joined model (the join carries the names of every chain)
alternative_to:
---
# Each gear is made in a chain of its own, and the chains are joined

**Asked (`in_1054`):** with a spiral crown gear and its meshed pinion, deleting the crown gear made the pinion be built again (the snapshot: 18 of 28 steps made, 14.7 s, a 12 s boolean). **Why:** the kernel keeps the answer of each step under a key made of the step and of the answers it works on, and the steps were one chain (each a `target` of the next): the pinion's first step stood beside the crown gear's body (`mode: "new"`, target the crown gear's last step), so when the crown gear's steps went the pinion's first step was a different step (no target, `mode: "add"`), and so was every step after it. A gear is made of its own numbers and needs nothing of the other bodies. The same thing happened at every change to a gear: all the gears after it were made again.

**Built (provisional: it changes how the model is compiled, and the AI chose it): the graph** (`compiler/graph.ts`) **gives each gear's own steps** (the ones that stand beside the others: `mode: "new"` extrude, revolve, loft and sweep, and the combine, sew and chamfer steps on its bodies) **a chain of its own, and a `join` step** (`compiler/kernel/occt/interpreter.mjs`: the bodies of the chains in one compound, nothing worked out) **stands them together** where a step that is not a gear's comes and at the end. The join carries the names of the bodies and of the faces of every chain, so what refers to them is as before. A gear that has a step of another kind (one that cuts or fuses into another body) is made in the one chain from there on, as before; one gear alone, or one and nothing else, has no join and the same steps as before. A chain that fails is left out of the join (its own step says why).

**Checked:** on the human's project, deleting the crown gear after both were made: **4.1 s before, 1 ms now** (every step of what is left is found as it was made; the snapshot's 12 s boolean is the pinion's); the volumes are the same (49,154 mm3 with both, 16,603 with the pinion); changing the first gear makes only its own steps and the join again. `test/gearislands.test.ts` (4 tests: the two that matter fail on the old code); the whole suite.

**Not done:** the same for bodies that are not gears (a body made by several steps and untouched by the rest still depends on the ones before it: the bodies of `dec_independent_bodies` are separate in the model but their steps are a chain); an edit that moves a gear (the move step comes after the join, as before).

## Rationale

The kernel's reuse of an answer is by what it was worked out from, which is right for steps that work on a body; a step that does not work on the others has nothing to share with them, and a chain made it share their keys. Giving each gear its own chain puts the dependence where it is. It is `provisional` because it is the AI's own change to the compile path, kept narrow (gears only) so that the rest of the model is made as before.
