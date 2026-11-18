# progressive (prototype, `in_908`)

**Meant to learn:** whether a model can be made in pieces (a group of steps built alone, in any order) and give the same bodies as the whole model: the claim that the safe-interaction rule of `q_progressive_load` rests on.

**Run (from `app/`):** `node --test ../prototypes/progressive/harness.test.ts` (`PROJECTS=a,b` names fixtures; `--test-name-pattern=assemblies` for the made assemblies only).

**Method.** The whole model is built from its scene; its steps are grouped (a step that uses another's body, or whose bodies touch another's by their boxes, joins its group; any step of another kind than a body maker, or one that makes no body of its own (it joins or cuts), makes everything one group: conservative); each group is built alone (the other steps taken out of the scene, the kernel's kept answers cleared) and its bodies compared with the whole model's: volume to 1e-9, box to 1e-6 mm, and the face names; the groups are then built in three other orders.

**Learned:** of 70 fixtures only the two grids are of several groups once the pattern is seen to use its source (the grouping needed that: the first version took the pattern for independent and built it without its source: 162 differences, all of that one mistake); the others are single bodies with modifying steps, which are one group by the rule. Of five assemblies made here (twelve boxes apart; boxes and gears apart; two boxes touching; two overlapping; gears meshing with a box apart) **17 groups built alone and in 6 other orders: 17 bodies, no difference**; the touching and the overlapping boxes were seen to be one group. Groups built alone are also quicker in all than the whole for gears (678 ms for 630) only because nothing is shared: the saving is in the **order and the pieces**, not in the work.

**Not tried:** groups that include modifying steps (fillets of a body of the group): the grouping would have to know which body a step changes (it does not: a fillet names an edge by its place); revolves, lofts and sweeps in assemblies; a body that moves; random edits in the middle (the fuzz of `q_progressive_load`).
