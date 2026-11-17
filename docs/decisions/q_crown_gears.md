---
id: q_crown_gears
kind: question
status: open
origin: ai-unreviewed
human_input: in_800, in_799
date: 2026-11-17
depends_on:
  - dec_bevel_gears: a crown gear is the limit of a bevel wheel (pitch angle 90 degrees); what it meshes with, and how a pair is linked and placed, follow that decision's
  - prin_manufacture_agnostic: the geometry is the tooth, not what a machine cuts; nothing per manufacturing route
alternative_to:
---
# A crown (face) gear: a flat gear with its teeth on its face

**Asked (`in_800`, after `in_799`):** the human approved making a crown gear. **Why a tool of its own:** a bevel gear's pitch angle follows the tooth counts (`tan d1 = z1 / z2` at 90 degrees); the crown gear is the pitch angle of exactly 90 degrees, where the pitch cone is a plane and the bevel gear's construction has no back cone left to cut with (`bevelLayout` refuses a cone that flat). Its teeth are straight and radial on a flat face, and a crown rack bent into a circle.

**What it meshes with:** (1) a **straight bevel pinion** at a shaft angle of 90 degrees plus the pinion's pitch angle (the pair of the bevel gear tool at an obtuse shaft angle); (2) a **spur pinion** at 90 degrees: the **face gear** of the usual drives. The spiral bevel prototype (`prototypes/bevel-spiral-generated`) already uses a crown gear as its generating gear, with circular-arc teeth.

**To decide (the human):** which of the two pinions the first tool is for; straight radial teeth first, spiral later (the crown is the generating gear of the spiral bevel); the face width limit (a crown tooth is thinnest at its inner end: at some inner radius the tip is pointed, `prototypes/bevel-spiral-generated` met the same limit for a spiral tooth).

**Plan (a prototype first, `prototypes/crown-gear`):** the tooth of a crown gear in the plane across its axis at the height `y` above the pitch plane; the body as a loft of those sections, an annulus with the teeth, as the spiral bevel's; the meshing pinion made by the gearing law (`generate.ts`), both measured in the kernel (the overlap of the pair at its place, rolled, and half a pitch round). Then a proposal (a decision entry) for the tool: its numbers (teeth, module, pressure angle, inner and outer radius, thickness), its place in the Gear menu, and how it is linked to its pinion. **Nothing outside `prototypes/` until the human accepts it.**

## Rationale

The flat end of the bevel family is a different object (a flat annulus with teeth on its face, no cone to cut) and is the generating member of the spiral bevel. Making it its own tool avoids pushing the bevel tool to a limit where its construction fails.
