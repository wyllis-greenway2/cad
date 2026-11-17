---
id: dec_bevel_gears
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_776, in_755, in_735
date: 2026-11-17
depends_on:
  - dec_gear_tool: a bevel gear is one more kind of gear record, its parts and body made from the record; a change to how a gear is a record changes it
  - dec_loft_sketches: the body is a ruled loft of two sections of the tooth outline, as the worm wheel's is a loft through sections
  - prin_manufacture_agnostic: the geometry is the tooth, not what a process makes well; nothing per manufacturing route
alternative_to:
---
# Straight bevel gear: built as an approximation, to be verified

**Decided (`in_735`, the human approved my proposal):** build the straight bevel gear now, marked everywhere as an **approximation** of the standard, and keep a list of what has to be verified later (the roadmap's "To verify later" and the open `q_bevel_gears`).

**Corrected (`in_776`):** the first body was a ruled loft between two sections across the axis, and that made the teeth look longer the more teeth the gear had: a section across the axis of the tooth cones is taller than the tooth by 1 / cos delta (6.2 mm for 3.1 at a 1:1 pair of module 2, 16.5 for 1.1 at 80:20). The real ends of a bevel gear are cones. **Now:** a prism of the tooth cones (a ruled loft of two sections, the outline scaled by `x / (R cos delta)` at the plane `x` from the apex, held as arcs: two to a flank) is intersected (`combine`) with a blank (a revolve: the heel's back cone, the toe's, flat hub discs inside the roots, `bevelLayout`); the three steps are the gear's (`$0`, `$1` in a step's parts are the names of the steps before it). Measured: no tooth reaches past the tip circle of the back cone (`test/bevel.test.ts`), the pairs still fit (with 0.1 mm backlash: with none the flanks touch along the line of contact and the kernel cannot tell touching from overlapping). It costs about 5 s a gear (the intersection is most of it), so the gear follows the speed rules of the others: the stand-in disc while it is made, a body of few parts (`gearshape.ts`), a wireframe preview of the true ends, and no solid draft while typing. **A pair stays a pair (`BevelSpec.with`, `dir`):** the teeth of either are the other's mate teeth; changing the teeth, the module, the pressure angle, the shaft angle or the face of either puts both right and the partner is placed again from the other, phase and all (`setGear`); one partner to a gear is linked.

**What is built:** `GearSpec.bevel = { mate, shaft?, face? }` (`operation/bevel.ts`, `bevelscene.ts`). Menu: Sketch, Gear, Bevel gear (approx.). Numbers: teeth, mate teeth, module, pressure angle, shaft angle (90 default), face width as a fraction of the cone distance (a third), backlash (mm off the tooth on the pitch circle at the big end), bore (flat or key as for any gear). The tooth is the Tredgold back cone tooth (an involute tooth of the equivalent spur gear, developed on the back cone), proportions from KHK-USA (long and short addendum, whole depth 2.188 m); the body is a ruled loft of the big end and the same outline scaled toward the apex, a piece of its own. The gear's plane is the plane of the big end and the apex lies along its normal. The title of the box and the outline's warning say "approximation".

**Mesh (`in_755`):** Mesh gear on a bevel gear makes its partner (`meshBevel` in `operation/mesh.ts`): same module and pressure angle, the source's tooth count unless typed, the cone apex shared, the axis at the shaft angle (90 default) in the direction asked (the Angle field or the pointer), turned so a tooth stands where the source has a gap. The partner stands across its plane: its own frame is in `BevelSpec.frame`. Measured with the kernel (`test/bevel.test.ts`): zero overlap when meshed, a large one half a pitch off, for 20 / 30 teeth at 90 degrees and 24 / 24 at 60. Known limits: editing the tooth count of a partner moves its cone distance but not its centre (make it again); no rack or ring of a bevel gear.

**Not built:** spiral bevel and hypoid; the octoid / spherical involute tooth of ISO 23509 and AGMA 2005 (no access to the standards); a table of suggested backlash; other than straight teeth.

## Rationale

The prototype (`prototypes/bevel-pair`) measured that two such gears fit (no overlap, with controls), and the proportions are from a manufacturer's published formulas the human supplied (`in_723`). What a standard fixes beyond that (the true tooth form, the thickness split, the face width, backlash values, undercut limits) could not be read, so the gear says what it is. Verifying it is the work listed in `q_bevel_gears`; this entry is replaced or edited when that is done.
