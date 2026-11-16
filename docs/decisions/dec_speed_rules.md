---
id: dec_speed_rules
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_597, in_596, in_595
date: 2026-11-16
depends_on:
  - dec_drag_preview_without_kernel: the rough/lite answers and the newest-wins queue these rules extend; a change to what a preview is allowed to be changes them
  - inv_kernel_boundary: the rules only add flags and cheaper paths behind the same graph-in, result-out boundary
---
# Speed rules for heavy bodies (helical gears first), system-wide where they can be

**Asked for (`in_595`, `in_596`), approved (`in_597`):** a twisted (helical) gear took 1 to 5 s to make; the measured split for 40 teeth with a bore (`prototypes/helical-feasibility/README.md`) is the twisted solid 0.6 s, validity checks about 1 s (three times), the bore as a second sweep plus a cut 0.6 s, body markers 0.5 s, the self-crossing check 0.7 s, the screen mesh 1.4 s. The rules, each to be measured where it is made (the numbers go under **Measured** below, and in the handoff):
1. **No repeated checks.** A result that was checked by the step that made it is not checked again by the runner, and a twist (every layer a rotated copy of one simple figure at its own height) is not searched for self-crossings.
2. **A hole is part of the profile.** A twist of a figure with figures inside it is one sweep of the figure with holes, not a sweep and a cut.
3. **Previews skip the safety checks.** A rough (`draft`) request does not run the validity and self-crossing checks; the whole answer that follows when the pointer is let go does, and refuses as before.
4. **The mesh is as fine as the screen shows.** The tolerance of the mesh is set from how big the part is on the screen at the zoom it is looked at (a hundredth of a pixel is not drawn), with the fine mesh made when the view has settled.
5. **Rough first, fine when settled; a load governor.** A heavy rebuild answers rough at once and fine after a pause; when the kernel queue is long the rough one is asked for by itself, and the fine one when the queue empties.
6. **An exact wireframe preview of a twist, computed in the page** (the outline turned at a few heights and joined along some edges of each tooth): this extends `dec_drag_preview_without_kernel`: the picture is still never an estimate, it is a rigid screw motion of the real outline, with no guess about topology.
7. **Gear-only:** fewer arcs to a flank as a **Detail** setting (4 by default, 2 for fast), for helical gears.

## Rationale

The helical gear is the first body with hundreds of curved faces made by a sweep; the cost is shared by every heavy body, so what can be a system rule is one. Each rule is kept only if its measurement shows a saving; a rule that does not pay is removed here with its number.

## Measured

One gear, 40 teeth, module 1.5, 6 mm bore, 12 mm wide, twisted 13.2 degrees (`prototypes/helical-feasibility/bench.test.ts`; each number is one run in a fresh process, from the page's request to the kernel's answer, in a sandbox with few cores: good for comparing). The kernel's own stage times are given.

| | before | after |
|---|---|---|
| **twisted, whole answer** | 4791 ms | **1940 ms** |
| twisted, rough answer (`draft`, `lite`) | | 1750 ms |
| flat extrusion of the same gear, whole | 2065 ms | 1503 ms |
| flat extrusion, rough | 1487 ms | 787 ms |
| twisted, **Detail 3** / **Detail 2** (arcs to a flank) | | 1696 / 1591 ms (volume 0.002 / 0.01 per cent off) |

What each rule paid (the kernel's own stage times for the twisted gear):
1. **No repeated checks, and a twist is not searched for crossings:** the op's checks 937 ms to 0 (the validity check three times, then the self-crossing check at 0.7 s). **Kept.**
2. **The bore is part of the profile:** the separate sweep and cut, about 600 ms, are one sweep. The library's own joining of a sweep with holes leaves the hole's wall facing the wrong way, so the solid measured as the figure *plus* the hole and the validity check did not notice; the joining is done here with the hole's walls turned (`twistedSolid`), and `test/speedrules.test.ts` measures the volume against the flat gear's. **Kept.**
3. **A rough answer leaves out the checks:** for a flat extrusion of this gear the checks were 580 ms of 1487 ms (a rough answer 2065 to 1487 before the other changes; 1503 to 787 after them). What was made without the checks is kept as unchecked and is made again, with them, when the whole answer is asked for (tested). It does not shorten the twisted gear, which has no checks left to leave out. **Kept.**
4. **Found while measuring (a new rule):** the biggest part of "the screen's mesh" was not the mesh (330 ms) but the exact box of a body of freeform faces (365 ms), the exact box of each of its 480 freeform faces (about 450 ms) and the body's marker, which took the exact box as well (420 ms). A box from the mesh (or the quick box for the marker and for sizing the mesh) is within the mesh's tolerance of the exact one and costs nothing; bodies of planes, cylinders, spheres, cones and tori keep the exact box. The description went from 1560 to 530 ms (whole) and 744 to 255 ms (rough), the marker from 420 to 8 ms. **Kept.**
5. **The mesh as fine as the screen shows:** the whole mesh costs 330 ms for this gear and a rough one 263 ms, so the most a screen-sized tolerance could save is about 65 ms (3 per cent). **Not built.**
6. **Rough first and fine when settled, and a load governor:** for the twisted gear the rough answer is 1750 ms against 1940 ms, so there is nothing to gain by answering rough first; for a flat extrusion it is twice as fast and already used while a size is dragged. **Not built.**
7. **A twist wireframe computed in the page:** the revolve's "wireframe" (`frame.ts`) draws the kernel's answer as edges, it does not avoid asking the kernel. A wireframe computed from the outline, with no kernel, will be made with the helical gear tool's preview; this extends `dec_drag_preview_without_kernel` as `in_596` flagged. **Built (`in_598`)** for the helical gear tool (the outline, the outline turned at the far end, one edge of each tooth in four pieces; worked out in the page, `previewFor`).
8. **Detail:** `GearSpec.detail`, the **Detail** field of the spur gear box (arcs to a flank, 2 to 8, 4 by default). Fewer arcs save little here (1940 to 1591 ms at 2) because the sweep itself is most of what is left; the volume is within 0.01 per cent. **Kept as a setting.**

**Left, for 40 teeth:** the twisted sweep and its checks about 1100 ms, the mesh and description about 700 ms.
