# Spherical involute tooth for the straight bevel gear (a prototype, `in_764`)

**Meant to learn:** whether the exact conjugate tooth of a straight bevel gear (a cone through the apex over a spherical involute, derived in `spherical.ts` with no source) fits a mate better than the Tredgold back cone tooth the app uses (`dec_bevel_gears`), as a stand-in for the octoid whose equations were not found (`q_bevel_gears`).

**Derived:** `df/dt = sqrt(sin^2 t - sin^2 gb) / (sin gb sin t)`, `sin gb = sin(delta) cos(alpha)`. **Checked (`spherical.test.ts`, passes):** the tangent of the curve has the constant axial component `sin gb` (the property the formula is derived from), for three cone and pressure angles.

**Measured (20 / 30 teeth, module 2, shafts 90 degrees, 0.1 mm of backlash, the kernel; the volume of the two bodies' intersection after turning the pinion by `eps` and the wheel by the matching angle plus a further 0.04 rad):**

| pinion turned | wheel further | Tredgold | spherical involute |
|---|---|---|---|
| 0 | +0.04 / -0.04 | 26.7 mm3 | 26.7 mm3 |
| 0.08 | +0.04 | 26.0 | 26.0 |
| 0.08 | -0.04 | 25.8 | 25.8 |
| 0.16 | +0.04 | 23.4 | 23.4 |
| 0.16 | -0.04 | 23.6 | 23.7 |

**What it learned:** the two teeth are **indistinguishable at this size** (the overlaps agree to 0.1 mm3 at every place), so for a 20 / 30 pair the Tredgold tooth is as good as the exact conjugate one and the spherical involute would not improve the fit. The overlap falls from 26.7 to 23.5 as the pair turns, the same for both: that comes from the test (the pair turned by an angle that is not exactly the meshing one, and flat ends), not from the tooth. **Two earlier runs measured nothing** and are not results: with no backlash the flanks touch along the line of contact and the kernel's intersection answered with a body of the pair unchanged; with the originals kept (`keep`) the largest body left was the wheel itself. **Not tried:** a larger ratio or fewer teeth (where Tredgold's error is larger), and the octoid itself.
