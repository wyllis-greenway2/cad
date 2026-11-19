---
id: dec_gear_models
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1105, in_1100
date: 2026-11-19
depends_on:
  - dec_gear_tool: the gears of a model are gear records made with the gear tool (they keep their numbers, can be edited and meshed as any gear); a change to how a gear is a record changes the models
  - dec_parts_fastener_pilot: a model is made as a fastener is, a list of steps run as one command (one step to undo), at the origin; a change to that way of making a part changes this
  - prin_manufacture_agnostic: no print-process presets: every room, fit and gap is a number the person sets
---
# Gear assemblies as models: a gearbox, a bearing, a differential and a cycloidal drive

**Asked** (`in_1100`) which gear assemblies to offer after the planetary set, and **approved** (`in_1105`): "build all those things. Lets put them under shape fabrication models": the four recommended (a reduction gearbox, a ball bearing, a
differential, a cycloidal drive; not a multi-speed transmission), under Shape, Fabricate, Models (where the Geneva plate already is).

**How they are made.** Not records that keep their numbers (as the planetary set is), but **models**: a dialog asks the numbers (the last ones are kept), and the model is made in one step as ordinary bodies at the origin, as a fastener is (`addpart.ts`:
a list of steps, each made from the scene the one before leaves, run as one `batch`). The gears in a model are gear records (`gear` commands: editable and meshable as any gear); everything else (rods, plates, races, balls, discs, pins) is a plain
body made by extruding or turning drawn figures. The pieces are separate bodies so each can be moved, printed or edited; rooms are numbers, with defaults that print (`prin_manufacture_agnostic`).
Code: `operation/modelparts.ts` (the builder), `operation/model*.ts` (one file for each), `interaction/addmodel.ts` (the dialogs), the ring items `model:*` in `control/pointer.ts`, the flow in `main.ts`.

**The four.**
- **Reduction gearbox** (`modelgearbox.ts`): 1 to 4 stages of a spur pinion and gear (10 or more teeth on the pinion, 1.5 to 6 times a stage), each stage in a layer of its own; the gear of one stage and the pinion of the next share a rod; rods through a base plate with four posts and a top plate (a gap of 0.2 mm under the lid so it stays a separate body). Numbers: stages, pinion and gear teeth, module, gear thickness, rod diameter, the room in a gear's bore and in a plate's hole, plate thickness, layer gap.
- **Ball bearing** (`modelbearing.ts`): an inner and an outer race, each turned with a round groove, and the balls, a body each, free in their grooves. Numbers: bore, outside diameter, width, balls, ball diameter, room round a ball. Default a 608 (8 by 22 by 7 mm, seven 4 mm balls).
- **Differential** and **cycloidal drive**: see the sections added as they are built.

**Not built:** a multi-speed manual transmission (shift forks and synchronisers do not print and work); the models do not keep their numbers (change one by making it again); they are made at the origin (not beside what is there); Play for the gearbox (the gears are linked by Mesh gear's record, so a gear pair can be played).

## Rationale

The planetary set took a record, a set of editing paths and a long chain of behaviour; a model needs none of that to be useful, and a fastener-style model gets the four assemblies into the person's hands quickly, with every gear still an ordinary gear. A model that
wants to keep its numbers can be made into a record later (the numbers are already one object each). The numbers come from the person, not from a standard, except where a part has one (the 608 size).
