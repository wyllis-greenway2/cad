# gear-spline-flank (prototype, `in_761`)

**Meant to learn:** whether a tooth flank made as **one B-spline** instead of a chain of arcs (4 a flank by default, `dec_gear_tool`) is more exact, has fewer faces, builds or cuts faster in the kernel, or renders with fewer triangles (`q_gear_finishing`).

**Run (from `app/`):** `Z=20 node ../prototypes/gear-spline-flank/flank.mjs` (`Z=40,100` for several tooth counts; a few minutes).

**Method.** A spur gear, module 2, 20 degrees, 8 mm thick, a 5 mm bore, no shift or backlash, built straight with replicad (not through the app's gear code): per tooth a foot line, the involute flank, a tip arc, the other flank, a foot line and a root arc. The flank is either `n` three point arcs through points of the true involute (as the app does) or one `makeBSplineApproximation` through `n + 1` points (the library approximates; it does not interpolate). Measured for each: the largest distance of 20 samples on each flank edge from the true involute (`dev`, mm along the circle), edges and faces, the time to make wire, face and prism (`build`), the volume against a 400 point polygon of the true outline, the triangles of the kernel's mesh at tolerance 0.01 and angular tolerance 0.1 and the time to mesh, and the time for `intersect` with the same gear turned half a pitch at the centre distance (what a meshing neighbour costs; the overlap should be nothing). One run each on a shared machine, so times are good to a factor of two, not better.

**Learned (2026-11-17):**

| teeth | flank | deviation | faces | build ms | triangles | mesh ms | intersect ms |
|---|---|---|---|---|---|---|---|
| 40 | 2 arcs | 0.0057 mm | 323 | 197 | 4660 | 141 | 351 |
| 40 | **4 arcs (the app)** | **0.0007 mm** | 483 | 85 | 5300 | 137 | 369 |
| 40 | 8 arcs | 0.0001 mm | 803 | 79 | 9140 | 264 | 776 |
| 40 | spline, 8 points, tol 1e-3, degree 3 | 0.0004 mm | **243** | **25** | 21134 | 204 | 288 |
| 40 | spline, 12 points, tol 1e-4, degree 3 | 0.0001 mm | 243 | 29 | 11860 | 119 | 576 |
| 100 | 4 arcs | 0.0000 mm | 1003 | 114 | 11700 | 477 | 1476 |
| 100 | 8 arcs | 0.0000 mm | 1803 | 217 | 21300 | 826 | 3414 |
| 100 | spline, 8 points, tol 1e-3, degree 3 | 0.0002 mm | **403** | **48** | **9300** | **123** | **825** |

- **Accuracy:** one cubic spline matches four arcs (0.0004 to 0.0007 mm at 40 teeth, a thousandth of the module and far below what a printer holds), and tolerance 1e-4 matches eight arcs. **But the spline is fragile in how it is asked for:** the first try (degree up to 5, tolerance 1e-5) gave 0.023 mm with 6 points and **0.22 mm with 10 points and 870 000 triangles**; degree 3 with tolerance 1e-3 or 1e-4 is the setting that works. The library approximates, so the curve does not pass through the points exactly.
- **Faces:** a spline flank halves the edges and faces (243 against 483 at 40 teeth), and with them the work of everything done per face. With `dec_gear_feature` the page already keeps 8 parts for a gear body, so the saving is in the kernel and mesh, not in the page.
- **Build time of the outline and prism:** 3 to 4 times shorter (25 against 85 ms at 40 teeth), a small part of a gear's cost.
- **Triangles:** **not reliably fewer.** At 40 teeth the spline gave 4 times the triangles of four arcs (21 000 against 5 300; 12 000 with tolerance 1e-4), at 100 teeth fewer (9 300 against 11 700). B-spline faces are meshed by their curvature and knots, arcs are exact cylinders: how many triangles a spline flank costs depends on its knots, which the library chooses.
- **Kernel booleans (intersect with a neighbour):** no consistent difference at 40 teeth (290 to 640 ms against 370), about 1.8 times faster at 100 teeth (825 against 1476 ms): within the noise of one run each, no more than a hint.
- **Overlap with the meshing neighbour:** nothing, for every row (the volume error of about 40 mm2 is the same in every row, about the area of two bores: a bookkeeping slip in this prototype's reference, so only the differences between rows mean anything).

**Not tried:** the spline interpolating exactly (an OCCT `GeomAPI_Interpolate` is not in replicad); fillet and root shapes as splines; a helical gear's spline faces (the twist sweep of a spline); STEP export; the real app's mesh settings; a printed gear. Only a few runs each.

**What it says for the decision:** a spline flank is as exact as the default four arcs, makes half the faces and builds the outline faster, but is not a sure win for triangles or booleans and is touchy about how the library is asked. It is not worth changing the default; if wanted, it is an option (`detail`) worth building only with the setting found here (cubic, tolerance 1e-3 to 1e-4), and the gain to look for is the face count, not the speed of drawing.
