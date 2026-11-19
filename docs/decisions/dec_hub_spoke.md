---
id: dec_hub_spoke
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1214, in_1216, in_1222, in_1236
date: 2026-11-19
depends_on:
  - dec_gear_models: the tool would be one more model in the Models menu, with the same box, edit and Size rules
---
# Hub and spoke tool: the Wheel model (the human's recipe)

**Asked (`in_1214`):** a tool that makes hubs and spokes for wheels, pulleys or any round object; alone, or on a selected round object so it is made into that object. **Chosen (`in_1216`):** a selected round object is **filled**. The first four spoke styles (tapered, flat taper, straight bars, web with round holes, built after `in_1222`) were **replaced** when the human wrote the recipe below (`in_1236`: "lets just do it ourselves"), after the casting research (sources README) showed no ready drawings.

## The recipe (human-authored, `in_1236`): the only attributes
1. **The web.** The plainest wheel is a web with no spokes: a **web (spoke) thickness**, the **rim** size (outside diameter, width, radial thickness) and the **hub** size (diameter, length, bore). The web meets the rim and the hub in **fillets or chamfers of a set size** (four of them: both faces, rim and hub).
2. **The spokes are cutouts in the web**: **count** (0 is the plain web), the **rim and hub offsets** (how far a cutout stops short of the rim and of the hub: 0 and the spokes run all the way into them; more and they join a web that joins the rim or hub), a **fillet of x size in every corner of a cutout** (no corner is ever left square: not machinable or castable), the **spoke width** and **taper**, and a **spiral**.
3. **Later (said by the human, not built):** true rod spokes, assembled hubs not made from one piece.

## What is built (mine, from that recipe)
`operation/modelwheel.ts` and the Models item "Wheel" (fields in `modelkinds.ts`): the section (rim, web, hub) is turned about the axis as one profile with the four joins (a fillet, or a chamfer, `join` mm); the cutouts (one outline each, repeated round) are cut through the web. A cutout is bounded by two spoke edges (straight; with a taper they lean; with a spiral they curve), an outer and an inner circular arc, and four corner fillets of `corner` mm (tangent circular arcs, worked out from each corner's angle). Offsets are measured from the hub's and the rim's walls: **0 runs into the wall** (the cutout reaches 0.05 mm into it; a cut that ends exactly on a face is not a solid the kernel makes); a cutout that ends within 0.4 mm of where a join ends is refused (a sliver); less than the join size and the cutout cuts into the fillet. **Refusals:** a fillet or chamfer or corner fillet under 0.8 mm (0.030 in, the Batesville guide's least), rim or web under 1.2 mm, hub wall under 2 mm, the rim and the hub must stand proud of the web by the join size, spokes narrower than 1.2 mm, spokes too wide for their number, corner fillets too large for the cutout (a strong spiral makes one corner sharp and is refused). **Fill:** with a drawn circle, a round face or a circular edge selected the tool starts centred on it, along its axis, as wide as it (`in_1216`). Typing a number that is 0 (an offset of none) sets no scale for the rest.
**Limits (honest):** no draft (castings want 1° to 3° on the walls, sources README); the corner fillets in the plan are exact circles only where the two sides are straight (a spiral edge is a polyline of 14 pieces, so its fillet is a close arc, not tangent to a curve); the spoke section is a rectangle; Fill makes a **new body** and does not cut away the disc it was selected on; no keyway or set screws, no pulley grooves (`q_timing_pulleys`); sizes are the human's, nothing standard.

## Rationale
The human first approved a proposal (`in_1222`) and then replaced it with their own complete list of attributes (`in_1236`), which is the authority for what the tool has; the choices under "What is built" are mine, listed so they can be changed.
