# rim-corner-precision (prototype, `in_1381`)

**Meant to learn:** whether a cut whose corners lie on a cylinder's rim meshes when the corner numbers reach the kernel at full precision, against rounded to a millionth as the app sends them (`r6`, `to2d` in `graph.ts`), as the first step of "a snapped corner is a reference, not a rounded copy" (`in_1372`, `in_1380` talk).

**Run (from `app/`):** `node ../prototypes/rim-corner-precision/rim.mjs`

**Method.** A cylinder (radius 12.5, and 12.500019, the radius the kernel gave in the user's file), 25 high; a triangle with its three corners at radius R + delta on the top, at 40 sets of angles; cut 8 mm down in replicad. "Closes" means the triangles of the result enclose the volume the kernel reports (to 1 %), the test of `cutmeshes.test.ts`.

**Learned (2026-11-20, 40 angle sets each):**

| corners | R 12.5 | R 12.500019 |
|---|---|---|
| exactly on the rim, full precision | 40/40 | 40/40 |
| exactly on the rim, rounded to 1e-6 (what the app sends) | **16/40** | **20/40** |
| 2e-5 inside (the old rounded rim) | 25/40 | 25/40 |
| 5e-7 inside | **0/40** | **0/40** |
| 1e-9 inside | 40/40 | 40/40 |
| 1e-9 outside | 40/40 | 40/40 |

- A corner exactly on the rim meshes every time **if it reaches the kernel exactly**. The rounding of the send to a millionth alone puts a corner in the failing band about half the time (a rounded coordinate is up to 5e-7 off, and any corner from about 5e-7 inside fails). So the send's rounding is the main cause, more than the old rounded rim data (`in_1372`).
- Closer than the kernel's own tolerance (1e-9 inside) is treated as on the surface and is fine.
- So a corner given as a reference to the rim must be sent unrounded (or the circle's point worked out inside the kernel); rounding it first undoes the reference.
- Not learned: whether the kernel's whole pipeline (the interpreter, the check of `in_1368`) keeps that precision from the graph to the cut; the rim of the user's file was not the one tested.
