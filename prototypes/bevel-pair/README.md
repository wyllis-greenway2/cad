# Straight bevel pair (a prototype, `in_719`)

**What it was meant to learn:** whether a straight bevel gear and its mate can be made from the loft the worm wheel already uses (two sections joined by ruled faces, scaled toward the pitch cone's apex), with the shafts at any angle, and whether the two teeth really fit.

**How the tooth is made (`bevel.ts`):** the Tredgold back cone tooth. The gear's equivalent spur gear has `z / cos(delta)` teeth, the same module and pressure angle; its involute tooth is developed on the back cone (the cone through the pitch circle, perpendicular to the pitch cone), carried round the axis (angle divided by `cos delta`) and projected through the pitch cone's apex onto a plane across the axis. The small end is the same outline scaled toward the apex, so the faces of the tooth are ruled by lines through the apex, as a straight bevel tooth's are. Pitch angle `tan delta = sin(sigma) / (mate / z + cos(sigma))` (`sigma` the angle between the shafts), cone distance `R = m z / (2 sin delta)`.

**What was read (and what was not):**
- Boston Gear, *Engineering Information: Miter and Bevel Gears* (a maker's catalogue; https://documents.mrosupply.com/product_documents/SH/SH82-P/1930-bg_engineering-info-miter-and-bevel-gears.pdf; read 2026-11-17): 20 degree pressure angle; AGMA long and short addendum system for stock pinions and gears (named, its numbers not given); straight tooth formulas: whole depth `hT = 2.188/P + 0.002 in`, addendum `a = 1/P`, dedendum `b = hT - a`, clearance `c = hT - 2a`, circular tooth thickness `1.5708/P`, pitch angle of the pinion `tan^-1(Np/NG)` (the gear's `90 - that`), outside diameter `Dp + 2 a cos(pitch angle)`; spiral bevels 35 degrees, pinion left hand, gear right hand. Used here with the module: `a = m`, `hT = 2.188 m + 0.0508 mm`.
- A search result (not a source read to the page): the virtual tooth count is `z / cos(delta)` and the cone distance `R = pitch radius / sin(delta)`; sources disagree on the face width: a maximum of `R / 3` and a minimum of `10 m` from lecture notes; `R / 3` is used here.
- **Not read: the standards** (AGMA 2005, ISO 23509, DIN 3971 are paywalled and were not reachable); the pages of KHK, Autodesk and Engineers Edge could not be fetched in this session (their hosts are not allowed). So the proportions are a maker's stock-gear numbers, **UNVERIFIED as the standard's**, the long-and-short addendum is not applied (both gears have `a = m`: right for a 1:1 miter pair, not the standard for other ratios), and a gear whose tooth is undercut or pointed is not checked.

**What it learned (`bevel.test.ts`, run in the app's kernel):** the pair is built as two lofts, each a piece of its own. Fit is measured as the other worm test does it: the two bodies intersected, the volume left over is the overlap (module 2, face a third of the cone distance, no backlash):

| pair (shafts) | at the computed place | teeth in each other (turned half a pitch) | 0.3 mm closer | 0.3 mm further |
|---|---|---|---|---|
| 20 / 20 (90) | no overlap | 120 mm3 | 2.1 mm3 | none |
| 20 / 30 (90) | no overlap | 164 mm3 | 3.7 mm3 | none |
| 24 / 24 (60) | no overlap | 217 mm3 | 2.4 mm3 | none |

So the teeth fit at the computed centre and the shaft angle can be anything (60 degrees was tried). Each body takes about 1 to 3 s to make. **Not tried:** a bore or a hub, a face width other than a third, tooth counts that undercut (under about 17 / cos delta), the long and short addendum, backlash, a gear that is a body with a thickness beyond its face.
