# Crown gear prototype (`dec_crown_gears`)

**Meant to learn:** whether a straight crown (face) gear and its straight bevel pinion, the pinion made by the gearing law from the crown's flank planes, fit in the kernel at a pitch angle of 90 degrees, where the bevel gear tool's construction has no cone left.

**Files:** `crown.ts` (the crown flank planes: through the radial line, the tooth narrowing by `y tan(alpha)` towards its tip at every radius; the pinion flank as the envelope, `pinionPoint`/`pinionGrid`), `crownbody.ts` (the crown: five teeth, each a ruled loft of three sections, fused with a plate; the pinion: the loft of its flank sections cut to the cone ends), `crown.test.ts`.

**Learned (zc 40, z1 18, module 2, 20 degrees, radii 34 to 46; each case in its own process):**
- The pair is conjugate: overlap at the place 0.7 to 1.3 mm3, rolled by 0.05 rad 0.8 to 1.3 mm3, half a pitch round 101 to 117 mm3 (bodies 2020 and about 11000 mm3). The cone shifts tried: -2, 0.7, 2 mm worked; -1.34 gave "invalid solid" (the same kernel fragility as the spiral bevel's cone cut).
- z1 = 14 with zc = 40 (virtual teeth 14.9) is **undercut** (the flank turns back below the base cone): the flank contour branches and the outline code refuses it. A crown gear's pinion needs the virtual tooth count above about 17 (20 degrees), as any bevel gear.
- Only straight radial teeth and a straight bevel pinion; the spur pinion (face gear) and the spiral crown are not tried.
