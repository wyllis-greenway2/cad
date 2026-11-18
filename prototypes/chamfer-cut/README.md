# chamfer-cut (prototype, `in_859`)

**Meant to learn:** why the tooth chamfer (`in_760`) adds 4 to 9 times to a gear's build time, and what makes it cheaper.

**Run (from `app/`):** `Z=40 node ../prototypes/chamfer-cut/chamfer.mjs`

**Method.** A 40 tooth spur gear (module 2, 8 mm, bore 5, the app's outline) built in replicad, and the same chamfer (0.3 module, 0.6 mm) cut three ways: one turned ring (the cone, as the app did), the ring in 40 sector pieces cut together, and 80 flat wedges (one at each face of each tooth, a plane at 45 degrees) cut together. The app's own timing by step (the kernel's stages) said the whole cost was the boolean of the cut (5.75 of 6.45 s), not the checks or the naming.

**Learned (2026-11-17, one run each):**

| the cutter | cut time | volume left | faces |
|---|---|---|---|
| one turned ring (a cone) | 5.8 s | 39680 | 563 |
| the ring in 40 sectors | 3.7 s | 39684 | 843 |
| **80 flat wedges** | **0.53 s** | **39681** | 563 |

- The cost is the cone meeting the flank faces (cylinders, 480 of them): the kernel finds those curves by marching. A plane meets a cylinder in an ellipse it knows exactly, so flat wedges are **11 times quicker** and remove the same material (to a cubic millimetre; the flat bevel differs from the cone by under 0.01 mm over a tooth tip's width).
- Cutting the ring in sectors only helps a little (1.6 times) and leaves seams.
- `simplify: false` on the cut changed nothing.
- (A first run of this prototype had the bore's wire the wrong way round, so the gear was an invalid solid and the cuts did nothing: found and fixed; the numbers above are from the fixed one.)

**In the app (`toothChamfer` step, `interpreter.mjs`), 8 mm thick, module 2, bore 5:** a 40 tooth spur gear 1.6 s plain and 1.85 s with the chamfer (was 5.9 s), 100 teeth 2.55 s and 4.65 s (was 13.8 s), a 40 tooth ring 1.35 s and 1.75 s; **a helical gear is still slow** (1.4 s and 5.8 s; was 11 s): the twisted flanks are not cylinders, so the planes meet them by the slow method. Not tried: a helical gear's wedges followed along the helix (a sheared prism).

**Tried for the helical gear (`in_860`, "make the helical wedges follow the helix"):** the step timing of a 40 tooth helical gear (15 degrees) with a chamfer: the revolve 1.0 s, the chamfer step 6.1 s of which **the cut's boolean 4.7 s** and the validity check of the result 1.0 s. Making the wedges narrower, so that each meets only its own tooth's faces (0.5 and 0.35 of a half pitch, against 1), changed nothing (6.8 s, 6.8 s and 9.4 s against 6.8 s, one run each): the cost is not how many faces the wedge reaches but that a plane meets a twisted (swept, B-spline) flank by marching, for each pair of faces. A wedge turned to lie along the helix would still be a plane against the same surfaces, so it was not built; nothing was changed in the app. Ideas not tried: a tool made as a twisted sweep of the same kind as the flank (its faces would be the same kind of surface, which may be quicker or may not), or building the end of a helical gear chamfered from the start (a loft between the chamfered and the full section) which has a twist mismatch to solve.
