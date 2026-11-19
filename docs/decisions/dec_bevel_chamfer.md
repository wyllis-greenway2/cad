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

**Design.** The same field (`GearSpec.chamfer`, in modules, 0 to 1): a flat 45 degree facet this deep (chamfer x module, mm) on each tooth tip at each end of the tooth, **made by trimming the corners of the gear's blank** (the revolved shape of the two back cones the tooth prism is cut by): where each back cone meets the tip cone the blank gets a facet (the cone of a facet is as cheap as the cone it replaces: no step is added, the 60 s browser limit is not touched). A straight bevel gear and a spiral or hypoid gear: the heel's and the toe's corners (`blankchamfer.ts`). A crown and a face gear: their teeth end on cylinders at the inner and outer radius; with a chamfer the blank's outer wall is at the outer radius (the loft goes 0.4 mm past it) and both walls get a facet (`endBlank`).

## As built (`in_967`)
`GearSpec.chamfer` (modules, 0 to 1) is a field of the Bevel, Spiral / hypoid, Crown and Face gear tools (the face gear's, not its pinion's), last in the list as a spur gear's. Straight bevel, spiral, ring and hypoid gears: `chamferedBlank` / `facetOf` in `blankchamfer.ts` replace the blank's two tip corners (the facet cuts the chamfer along the back cone and along the tip cone and goes on to the margin above it: it works for a pitch angle over 45 degrees, the ring gear's, which an extension to a set radius did not); crown and face gears: `endBlank`. **Measured (kernel, `bevelchamfer.test.ts`):** a straight bevel gear, a spiral pinion and ring gear, a crown and a face gear with half a module are one body with 0.2 to 3 per cent less volume, 1 to 3.5 s longer to build, and rendered with the tips broken at the heel and the toe (crown and face: the inner and the outer end). **Limits:** the crown and the face gear refuse a chamfer deeper than their teeth are long allow (`shortestFor`; the first try with a taller blank had its two facets meet and the boolean failed). Mesh gear gives the partner the source's chamfer and a change of the chamfer on one gear of a bevel, spiral or crown pair follows on the other (`in_988`, `withChamfer` in `gearscene.ts`); a face gear's spur pinion has none (its tooth is a spur's: a chamfer for it needs the spur gear's own, not built).

## Rationale
The human asked about it (`in_968`) and for it (`in_967`). The blank is the one place where the end cones and the tips meet, so trimming it breaks exactly the tooth tips and leaves the flanks and the faces alone, as the spur gear's tooth chamfer does.
