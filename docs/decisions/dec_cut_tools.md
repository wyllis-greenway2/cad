---
id: dec_cut_tools
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1346, in_1347, in_1348
date: 2026-11-20
depends_on:
  - dec_modifications_are_steps: a cut is an extrude step (mode cut) with a depth; going both ways and the tool being picked are about that step, not a new kind of thing
  - dec_preview_without_boolean: the cut tool is drawn from its figure by arithmetic, without the kernel, as a preview is
alternative_to:
---
# A cut can go through both ways from its plane; the cut's tool is shown and picked as a ghost "negative body"

The human's file had one hole, a circle cut 40.3 mm toward one side of its plane, that crossed the cavity and so looked like two holes; they could not be moved apart, and one end broke through the rounded floor of a notch while the other did not, because the cut began at its sketch plane and went one way only (`in_1346`, `in_1347`). They asked for both of the AI's proposals: **a cut that goes through both ways from its plane**, and **the cut shown as a ghost negative body that can be picked and moved like a positive body** (`in_1348`).

1. **Both ways.** An extrude step has a number `both` (1: on). With it the tool is the figure's prism the depth one way **and** the depth the other way from the same plane (the plane stays the middle). It is a property of the step (`setStepParams`), kept in the file; one undo takes it back. It works for any extrude, and is offered where a cut is picked.
2. **The ghost.** The tool of every cut step (the prism of its figure, drawn without the kernel, `operation/cutghost.ts`) can be shown as a translucent ghost (View, **Show cuts**; also shown while one is selected). Clicking a ghost selects the cut's figure parts, so the Move tool moves it the way it moves a figure, and the cut is made again where it now stands: a cut is moved as a body of its own is. The ghost follows `both` and the depth.
3. **What stays:** the cut is still its step and its figure; the ghost adds no new part or step. A figure used by a cut stays hidden as before; the ghost is the way to see and pick it.
4. **Limits of the first slice:** the ghost is the outer outline of each figure extruded (holes inside a figure are not carved out of it in the picture); a depth that is a parameter or a revolve, sweep or loft cut has no ghost yet; the ghost has no tooltip.

## Built (`in_1348`)
- **Both ways:** `both: 1` on an extrude step; `graph.ts` adds, for each figure, a sibling of the same figure extruded by the opposite depth (the kernel's `also`), so the tool is the figure the depth each way. `test/cutboth.test.ts`: a circle on a block's face cuts nothing one way and the 20 mm the other, and the same 20 mm with `both` whichever way the depth points.
- **The ghost:** `interaction/cutghost.ts` (`cutGhosts`, `ghostHit`): the tool of every cut step as triangles from its figure (caps by `triangulate`, sides from the outline; `both` makes it the depth each way), kept while the scene is the same object. `View, Show cuts` (`view:cuts`, the ring's View list; `AppState.showCuts`) draws all of them as red translucent ghosts (`view.setCutGhosts`); a selected cut's ghost is drawn without it. A click on a ghost (not on a handle of the mover) selects the cut's figure (`doClick`, `pointer.ts`; Shift adds). The bar then has a **both ways** button (`cut:both:<step>`, icon `cutBoth`) that toggles `both` through `setStepParams`. The **Move tool on the selected figure moves the cut**, which is then made again where it stands (tested on the human's file: the ghost moves).
- **Tested on the human's `holes.json`** (`test/fixtures/holes-in_1347.cad.json`): its hole has a ghost, a click selects its figure, the bar offers both ways, both ways removes more and one way again gives the volume back.
- **Not built (the limits above):** holes inside a figure are not carved out of its ghost; a cut whose depth is a parameter, and revolve, sweep and loft cuts, have no ghost; no tooltip on the ghost; the ghost is picked before the body behind it while Show cuts is on (so a body under a ghost is reached by turning Show cuts off); not seen in the browser.

## Rationale

A cut is a body taken away; showing it as one makes it something that can be seen, picked and moved, which the hidden sketch of a used figure never was. Going both ways makes a through hole through, whatever side of the part its sketch plane is on. Both are kept as plain facts of the step, so they save, replay and undo like any other.
