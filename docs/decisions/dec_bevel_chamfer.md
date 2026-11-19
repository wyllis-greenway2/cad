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
`GearSpec.chamfer` (modules, 0 to 1) is a field of the Bevel, Spiral / hypoid, Crown and Face gear tools (the face gear's, not its pinion's), last in the list as a spur gear's. Straight bevel, spiral, ring and hypoid gears: `chamferedBlank` / `facetOf` in `blankchamfer.ts` replace the blank's two tip corners (the facet cuts the chamfer along the back cone and along the tip cone and goes on to the margin above it: it works for a pitch angle over 45 degrees, the ring gear's, which an extension to a set radius did not); crown and face gears: `endBlank`. **Measured (kernel, `bevelchamfer.test.ts`):** a straight bevel gear, a spiral pinion and ring gear, a crown and a face gear with half a module are one body with 0.2 to 3 per cent less volume, 1 to 3.5 s longer to build, and rendered with the tips broken at the heel and the toe (crown and face: the inner and the outer end). **Limits:** the crown and the face gear refuse a chamfer deeper than their teeth are long allow (`shortestFor`; the first try with a taller blank had its two facets meet and the boolean failed). Mesh gear gives the partner the source's chamfer and a change of the chamfer on one gear of a bevel, spiral or crown pair follows on the other (`in_988`, `withChamfer` in `gearscene.ts`); a face gear's spur pinion has its own chamfer field (below), not tied to the gear's.

## Rationale
The human asked about it (`in_968`) and for it (`in_967`). The blank is the one place where the end cones and the tips meet, so trimming it breaks exactly the tooth tips and leaves the flanks and the faces alone, as the spur gear's tooth chamfer does.

## The face gear drive's spur pinion (`in_1006`)
The pinion's Chamfer field is the spur gear's tooth chamfer (`chamferOf` for `facegear: "pinion"`, `pinionWidth` moved to `face.ts`): the kernel's `toothChamfer` in the frame its pair gave it (`gearscene.ts` `chamferSteps`: the axis the normal of the frame, tooth 0 along its first direction turned by the turn). Refused when deeper than half its width. Test in `bevelchamfer.test.ts`: alone and in its pair with a face gear (less volume, one body each, the pair fits).

## Rendering sweep (`in_1006`)
Built one gear of each kind alone and rendered the exported meshes (a software renderer in a scratch script, painter's order, Playwright screenshots): straight bevel pinion, ring, 1:1 and chamfered; spiral pinion, ring, 40 degree ring, 17 / 43 ring, chamfered; hypoid pinion and ring, plain and chamfered; crown, spiral crown (30 and 45 degrees) plain and chamfered; face gear plain and chamfered; the face pinion plain and chamfered: **22 gears, each one body, no step errors, no ragged or lumpy teeth at that size, the chamfers visible on the tooth ends.** Looked at closer: the face gear's teeth (tooth tops looked pinched at the waist; **the first reading, "the involute shape", was wrong: measured, the tooth was wider at the tip than a little under it, see `dec_crown_gear_set` "The tooth top", fixed `in_1015`**). Not rendered: the pairs meshed together beyond the earlier ones, the heavy end of the limits.

## Tooth widths measured, and the pairs in contact (`in_1022`)
**`toothshape.test.ts` (with `test/helpers/toothwidth.ts`, the width of a tooth's material at a radius measured on an outline, the tooth followed as it leans):** in every plane across a spiral or hypoid gear (five pairs: 20 / 30, 24 / 36 at 40 degrees, 17 / 43, hypoid 20 / 36 offset 12 and 16 / 24 offset 6, pinions and ring gears; a plane with the part the blank's cones cut away mostly gone is not measured) and a straight bevel gear's outline the tooth gets no wider towards its tip; for a straight crown, a spiral crown (30 and 45 degrees) and three face gears the tooth is at every radius no wider at a height than at the one below it. **All pass; the test fails on the face gear as it was before the fix** (`face 40 / 14: at radius 40.5 the tooth is 3.42 mm wide at height 2.00 and 2.56 at 0.80`), so it would have caught it. (One plane of the 17 / 43 ring did widen by 16 per cent near the tip: the heel end, where the blank cuts that part away.) **Pairs in contact, rendered** (each gear its own colour, zoomed where they touch, two views, the exported meshes of the pair at its place): straight bevel, spiral, hypoid, crown, spiral crown and face gear drive: the teeth interleave, no tooth is seen through another, no odd shape; the overlaps measured at the place 0.00 to 1.4 mm3.

