---
id: dec_bevel_chamfer
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_967, in_968
date: 2026-11-18
depends_on:
  - dec_bevel_gears: the straight bevel gear's body is a prism of its teeth cut by a revolved blank of two back cones; the chamfer trims that blank
  - dec_spiral_bevel_gears: the spiral and hypoid gear's body is made the same way (`blankFor`)
alternative_to:
---
# A tooth chamfer for the bevel family (accepted in_967: "do 2")

**Asked (`in_968`):** whether the crown gear should have a bevel (the AI offered it for the crown, face, bevel and spiral gears; `in_967`: build it). Spur gears have a Chamfer field (the tips of the teeth broken at both faces, `in_791`); the bevel family's tips are sharp.

**Design.** The same field (`GearSpec.chamfer`, in modules, 0 to 1): a flat 45 degree facet this deep (chamfer x module, mm) on each tooth tip at each end of the tooth, **made by trimming the corners of the gear's blank** (the revolved shape of the two back cones the tooth prism is cut by): where each back cone meets the tip cone the blank gets a facet (the cone of a facet is as cheap as the cone it replaces: no step is added, the 60 s browser limit is not touched). A straight bevel gear and a spiral or hypoid gear: the heel's and the toe's corners (`blankchamfer.ts`). A crown and a face gear: their teeth end on cylinders at the inner and outer radius (to be done after the cones; if the blank cannot carry them, a separate cut).

## Rationale
The human asked about it (`in_968`) and for it (`in_967`). The blank is the one place where the end cones and the tips meet, so trimming it breaks exactly the tooth tips and leaves the flanks and the faces alone, as the spur gear's tooth chamfer does.
