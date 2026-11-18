# Face gear prototype (`dec_crown_gear_set`, `in_878`)

**Meant to learn:** whether a face gear (the crown gear for a SPUR pinion, axes crossing at exactly 90 degrees) can be made from the gearing law, and what its tooth is. The crown gear's bevel pinion stands at 90 degrees plus its pitch angle (116.7 for 18 on 40); the human wanted a pair at 90 degrees, which only a spur pinion on a face gear gives.

**Files:** `face.ts` (the pinion's involute flank in a frame with the axes crossing at the origin, the pinion's axis x, the face gear's z; the face gear's flank the envelope: the pinion turned t about x, the face gear z1/z2 t about z, in contact where `P0 + P1 cos t + P2 sin t = 0`; the contour of a flank at a height; its curve as azimuth against radius), `facebody.ts` (the face gear: a loft through six heights, two arcs to a flank, cut by a revolved blank and joined to a plate; a spur pinion as a ruled loft), `face.test.ts`, `facebody.test.ts`.

**Learned:**
- **The tooth is not a plane** (the crown gear's is): its flank curves in the plane at each height and the slot widens with the radius in angle, so the tooth is thinner at the outer end; at the pitch plane the slot is a half pitch wide at the pitch radius, as it should be.
- **Pair (14 / 40 teeth, module 2, 20 degrees, 0.05 mm backlash, radii 40 to 46), by the kernel:** overlap 2.0 mm3 at the place, 2.1 rolled by 0.05 rad (the face gear z1 / z2 as much), 49.2 half a pitch round.
- **The inner limit:** no envelope inside r = 37.7 (R2 - 2.3 mm) for 14 / 40: the surface does not exist there (the pinion's flank cannot generate it): that is the undercut limit of a face gear, to be refused by the tool.
- **The tooth's tip is limited by the pinion's base circle:** above 0.42 m over the pitch plane (14 teeth) the pinion's flank is the radial line below the base circle; the face gear's flank there is that radial line's envelope; the tip height used is m.
- **The slot walls below the pinion's tip** (the root clearance) are made straight down: the last section copies the one above it.
- **Smooth lofts of 22 straight sides a tooth ran the kernel out of memory in the join with the plate; two arcs to a flank (six sides a tooth) work.**
