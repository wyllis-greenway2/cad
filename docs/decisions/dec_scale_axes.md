---
id: dec_scale_axes
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_387, in_388
date: 2026-11-15
depends_on:
alternative_to:
---
# Scaling along x, y or z alone, or all together: the recipe is stretched

`in_387` asks for the scale tool to scale along x, y or z independently or all together, perhaps with x y z arrows and an extra arrow for "all together". Today scale is one number, uniform, about a pivot (`scale` step, `transform` in the kernel, `Rigid.k` for the sketches that follow).

**Finding.** The kernel build has no shape-level general transform: `gp_GTrsf` exists but `BRepBuilderAPI_GTransform` is not in the wasm build (checked), so a solid cannot be stretched along one axis by the kernel as it is. Stretching also turns flat faces and cylinders into free-form surfaces, which the app's face editing, anchors and select-similar rely on being flat or round.

**Decided (`in_388`): option 1.** The options were:
1. **Stretch the recipe, not the solid:** a per-axis scale rewrites the sketches and distances the body was made from (profile points along the plane's axes, extrusion depths along the third), so the result is still exact prisms and cylinders-become-ellipses are not needed; works for bodies made of extrusions aligned to the axes, refused for the rest (with the reason). Most work, best result for printing parts.
2. **Per-axis scale only where it is exact:** boxes and prisms (a body whose faces are all flat and axis-aligned) are rescaled by moving their faces; anything else offers the uniform scale only.
3. **Rebuild the kernel with the general transform** and accept free-form surfaces after a stretch (face edits and anchors then stop working on that body).

Uniform ("all together") scale with the new arrow layout can be built at once under any option. **Recommendation:** option 1 (or 2 as its first slice), uniform arrow first.

**Changed (`in_483`):** the handles are arrows with heads (no balls), all standing at the middle of the body and as long as the mover's, so on a thin body they are apart and not tied to the body's corner. The all-together arrow runs out along (1, 1, 1), at the same angle to X, Y and Z (for a drawn figure: along the sum of the axes of its plane). *AI's pick of the two layouts offered in `in_483` (the other: the opposite corner, pointing away from each axis): the human has not said which; say if the other is wanted.* **Bug fixed:** a pull on a second axis made the first axis's factor again on the body already stretched (X pulled to 2, then Y: X came out 4). A stretch along axes is now a *live* operation (`isLive`): a later pull takes the earlier step out and makes it again with the totals.

## Rationale

Recorded because production code for it needs an accepted entry (`CLAUDE.md` rule 9) and the choice changes how scale is built.
