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
- **Differential** (`modeldifferential.ts`): two side gears on the x axis and two spider gears on a cross pin along y (four straight bevel gears made with the gear tool and meshed by `meshWith`, so their teeth stand as the gear tool stands a pair; the second spider is the first turned half a turn about the axle, which needs an even side gear), a tube cage with a hole through its wall for the pin (cut before anything else is made, so it cuts the cage alone), two caps 0.2 mm off the tube, two axles that end before the pin, and a spur drive gear round the cage (0 teeth for none) that also keeps the pin in. The cage's size comes from the gears' blanks (`bevelLayout`: the back cone stands behind the big end's plane). Numbers: side and spider teeth, module, axle and pin diameters, rooms, wall, cap, the drive's teeth, module and thickness. Default 16 / 10 teeth at module 2.
- **Cycloidal drive** (`modelcycloidal.ts`): a base plate with N ring pins (one body), the disc with N - 1 lobes, the input shaft with its eccentric (joined), and an output plate with pins through holes in the disc (one body). The disc's outline is the curve the pins' centres trace on it, `R e^(it) - E e^(iNt)`, taken in by the pin's radius and the room (derived from the rolling, checked: the disc clears every pin at 90 turns of the input, the least room being the room set). Refused: the eccentricity at or over R / N (the outline loops), pins too big for the lobes' curvature, an eccentric too small for the shaft, output holes into the eccentric's hole or through the disc's edge. Default 10 pins, ratio 9 : 1.

**Checked** (`app/test/models.test.ts`, with the kernel): each model has the bodies it should; the gearbox's rods touch no gear or plate; the bearing's balls are 33.5 mm3 each and touch no race; the differential's side gears and spiders share under 8 mm3 each pair and nothing else touches; the cycloidal drive's bodies are all apart and the disc clears every pin at every turn. Made in the real app from the ring (Shape, Fabricate, Models). Times in Node: gearbox 7.5 s, bearing 1 s, differential 18 s, cycloidal 3 s.

**Not built:** a multi-speed manual transmission (shift forks and synchronisers do not print and work); the models do not keep their numbers (change one by making it again); they are made at the origin (not beside what is there); Play (the motion tool) was not tried on them: the gears of a model are linked by `meshWith` as Mesh gear links them, but no mate or pivot is made for the rods or the cage.

## Rationale

The planetary set took a record, a set of editing paths and a long chain of behaviour; a model needs none of that to be useful, and a fastener-style model gets the four assemblies into the person's hands quickly, with every gear still an ordinary gear. A model that
wants to keep its numbers can be made into a record later (the numbers are already one object each). The numbers come from the person, not from a standard, except where a part has one (the 608 size).
