---
id: dec_crown_gears
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_802, in_801
date: 2026-11-17
depends_on:
  - dec_bevel_gears: the pinion is the bevel gear tool's straight bevel at an obtuse shaft angle; pair linking follows that decision's
alternative_to:
---
# Crown gear tool (accepted in_802; built)

**Approved (`in_801`):** first pinion a straight bevel; straight radial teeth; spiral later. **Proposed, awaiting approval:** Gear > **Crown gear** with Teeth, Module, Pressure angle, Inner radius, Outer radius, Thickness, Bore; "Mesh gear" on a crown makes a straight bevel pinion of the chosen teeth (at least 17 virtual teeth, else refused as undercut) placed at shaft angle 90 degrees plus its pitch angle, linked as the bevel pair is. Inner radius limited so the tooth tip is not pointed. Built as the prototype is (teeth lofted, plate fused); cone cut retried at other shifts when the kernel refuses.

## Rationale

`prototypes/crown-gear` showed the pair conjugate in the kernel (overlap about 1 mm3 at the place against over 100 half a pitch round). The numbers and menu place are my proposal; the human has not yet approved them.

## As built (`in_802`)
Gear > **Crown gear** (`tool:crown`). A crown gear is a **bevel gear record** whose pitch angle comes out a right angle (`isCrown`, `bevel.ts`): its `bevel.mate` is the pinion's teeth, its shaft angle 90 degrees plus the pinion's pitch angle (`crownShaft`, worked out from the two counts by the tool and by `setGear`), so the bevel gear's Mesh gear, link (`with`, `dir`, `frame`) and re-seating are its own. Fields: Teeth, Pinion teeth, Module, Pressure, Inner radius, Outer radius, Thickness, Backlash, Bore (+ flat, key). Defaults: 40 teeth, pinion 18, the teeth from the pitch radius less 15% of it to the pitch radius (`CROWN_FACE`; a third would make the teeth pointed: the tooth is thinnest at its inner end), plate 2 modules. Tooth: flank planes through the radial lines, tip `m` above the pitch plane, root `1.25 m` below (the pinion's addendum `m`, dedendum `1.25 m`, which a pinion whose mate is a crown gear has: `bevelOf`); a deeper root closes the gap at the inner end. Refused with the reason: a pinion undercut (virtual teeth under 2/sin2 alpha), pointed teeth, closed gaps, a bore beyond the inner radius. Body (`crownscene.ts`): a ruled loft of the toothed ring between two sections, cut by a revolved blank (a thin hub joins the teeth), a plate disc (half a module wider than the tips) joined with it. **Measured** (`app/test/crown.test.ts`): 40 / 18 teeth, module 2: the pinion's overlap with the crown at its place 0 mm3, half a pitch round 33 to 48 mm3. **Not built:** a spur pinion (face gear), spiral teeth, the live preview of the pair's contact.
