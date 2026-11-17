# helical-fast (prototype, `in_806`)

**Meant to learn:** where a helical gear's build time goes, and whether sweeping one tooth and copying it round, or building the shell by hand instead of sewing it, makes it faster.

**Run (from `app/`):** `Z=40 node ../prototypes/helical-fast/helical.mjs` (`Z=100` for a hundred teeth).

**Method.** A helical gear (module 2, 8 mm, 15 degrees, bore 5, the app's outline) made as the app does (one `twistExtrude` of the whole outline and of the bore, the end faces, `makeSolid`), against (2) one tooth's open wire swept and its faces turned to every tooth, then sewn, and (3) the whole sweep with the faces put into a shell by hand with no sewing. Single runs on a shared machine.

**Learned (2026-11-17):**

| teeth | whole sweep | end faces | sewing (`makeSolid`) | total |
|---|---|---|---|---|
| 40 | 226 to 259 ms | 100 to 127 | 196 to 270 | 525 to 660 ms |
| 100 | 713 to 806 | 258 to 330 | 454 to 516 | 1430 to 1640 ms |

- **One tooth swept and copied:** the sweep drops to 4 ms and the copies take 32 ms, but the sewing gets dearer (381 ms at 40 teeth: the copies share no edges), so the total is the same (about 500 ms at 40 teeth against 560).
- **A shell built by hand with no sewing:** no quicker (187 against 196 ms; `ShapeFix_Solid` is most of it) and **invalid** (a solid of the wrong volume): not usable as tried.
- **Where the app's time goes** (a 100 tooth helical gear, 4.7 s in a CPU profile): the twist step 2.4 s (the sweep 0.64, sewing 0.56, the end faces about 0.25, the validity check 0.47, a volume 0.33 and what is left for roles and names), then the description of the body for the page 1.6 s (its mesh 0.9, a volume again 0.33, face centres 0.27). A spur gear of the same size takes 2.5 s: its flanks are cylinders, a twisted one is a B-spline surface to sweep, sew, measure and mesh.
- **Tried in the app and taken out again:** keeping the volume measured by the twist step for the description to use (saves 0.1 s at 40 teeth, 0.3 s at 100): not measurable against the noise of the machine (4.27 s against 3.95 s), so not kept.
- **A plain helical gear is not slower than a spur gear** of the same size here (40 teeth: 1.4 s against 1.8 s); what is slow is the chamfer on it (`prototypes/chamfer-cut`) and large tooth counts.

**Not tried:** a chamfered tooth made on one tooth block and copied round (the cut of the wedges on 1/40 of the gear, then the faces turned to every tooth and sewn, as in (2)): it would take the chamfer's cut from 4.7 s to about a fortieth of that plus the sewing, but needs the bottom and top faces built from the copies' edges and the chamfer made part of the body's own step; a coarser mesh for twisted faces.
