---
id: dec_bearing_library
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1145, in_1146
date: 2026-11-19
depends_on:
  - dec_gear_models: the bearing is one of the models (the same placement tool, build part by part, Play); a change to how models are built changes it
  - dec_glue: a bearing's rings and a shaft are held together by glue when it is used to drive things
alternative_to:
---
# Catalogue ball bearings

**Asked** (`in_1145`): the bearing should be a creator like the fastener creator, with real bearings, since the clearances on the balls looked wrong. **Approved** (`in_1146`: "yes do all three"; both kinds, deep-groove 6xx and 62xx first).

**What it is.** *Bearing* (`model:ballbearing`) takes a bearing number (`operation/bearingdata.ts`): 22 deep-groove bearings, 623 to 627, 607 to 609, 6000 to 6006, 6200 to 6206, with bore, outside diameter and width as the two sources give them. The balls' count and diameter are NSK's for the 60 and 62 series; for the miniatures, where no catalogue was read, a typical rule is used and the box says so. A number not in the list is refused (6007 etc. need a second source). The groove radius is 0.52 of the ball plus the room (default 0.02 mm, set by the person: `prin_manufacture_agnostic`), the races' surface 0.22 of the ball from the ball circle. Balls are bodies of their own, free in the groove; nothing touches. *Print bearing* (`model:bearing`) is the print-in-place kind, with its own numbers and a larger room.

**Constraints on load** (`in_1153`). Both bearing kinds are made with the outer ring held (`setFixed`) and the inner ring set to turn about the bearing's axis (a pivot), so a shaft or gear made after it can be glued to the inner ring and driven, and Play turns the inner ring with the balls going round it. Not built: a shaft made with the bearing.

## Rationale

The first bearing had made-up proportions; real catalogue sizes make the clearances right and give the person parts that fit real shafts and housings. Sources are in `docs/sources/README.md`.
