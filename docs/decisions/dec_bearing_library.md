---
id: dec_bearing_library
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1145, in_1146, in_1162, in_1163, in_1171
date: 2026-11-19
depends_on:
  - dec_gear_models: the bearing is one of the models (the same placement tool, build part by part, Play); a change to how models are built changes it
  - dec_glue: a bearing's rings and a shaft are held together by glue when it is used to drive things
alternative_to:
---
# Catalogue ball bearings

**Asked** (`in_1145`): the bearing should be a creator like the fastener creator, with real bearings, since the clearances on the balls looked wrong. **Approved** (`in_1146`: "yes do all three"; both kinds, deep-groove 6xx and 62xx first).

**What it is.** *Bearing* (`model:ballbearing`) takes a bearing number (`operation/bearingdata.ts`): 22 deep-groove bearings, 623 to 627, 607 to 609, 6000 to 6006, 6200 to 6206, with bore, outside diameter and width as the two sources give them. The balls' count and diameter are NSK's for the 60 and 62 series; for the miniatures, where no catalogue was read, a typical rule is used and the box says so. A number not in the list is refused (6007 etc. need a second source). The groove radius is 0.52 of the ball plus the room (default 0.02 mm, set by the person: `prin_manufacture_agnostic`), the races' surface 0.22 of the ball from the ball circle. Balls are bodies of their own, free in the groove; nothing touches. The print-in-place bearing was removed (`in_1162`). The *Size* box picks the listed bearing whose outside diameter is nearest (a number typed wins), since a catalogue bearing has fixed sizes.

**Two paths** (`in_1163`, `in_1171`): Models > *Bearings* > *Deep groove ball* opens a ring of two: **Catalogue** (`model:ballbearing`) has one field, the bearing number, and makes a **simple** bearing only: an inner and an outer ring, each a plain donut, at the real bore, outside diameter and width (the *Size* box picks the listed bearing whose outside diameter is nearest). **Your own** (`model:ownbearing`) makes a bearing of numbers: *Detail* 0 (the default) is simple, 1 is detailed (the grooves and the balls, their count, size and the room set or a typical set), with bore, outside diameter, width and the inner ring's outside diameter (the outer ring has the same wall); all of its lengths grow with the *Size*. The inner ring's outside diameter of a catalogue bearing is **worked out** (the ball circle less 0.22 of a ball), not read: the sources give the shaft and housing shoulder diameters (da, Da), not the ring's own. Play turns the inner ring with the outer held (and the balls round it, in detail).

**Simplified:** the model has the rings and balls only. A real bearing also has a cage that spaces the balls, and shields or seals (or a snap ring); the balls go in by the eccentric (Conrad) assembly, which the model does not show.

**Constraints on load** (`in_1153`). Both bearing kinds are made with the outer ring held (`setFixed`) and the inner ring set to turn about the bearing's axis (a pivot), so a shaft or gear made after it can be glued to the inner ring and driven, and Play turns the inner ring with the balls going round it. Not built: a shaft made with the bearing.

## Rationale

The first bearing had made-up proportions; real catalogue sizes make the clearances right and give the person parts that fit real shafts and housings. Sources are in `docs/sources/README.md`.
