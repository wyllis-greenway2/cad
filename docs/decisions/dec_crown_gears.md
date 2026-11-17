---
id: dec_crown_gears
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_801
date: 2026-11-17
depends_on:
  - dec_bevel_gears: the pinion is the bevel gear tool's straight bevel at an obtuse shaft angle; pair linking follows that decision's
  - q_crown_gears: the open question this proposal answers (first pinion straight bevel, straight teeth first, approved in in_801)
alternative_to:
---
# Crown gear tool (proposal, not yet approved)

**Approved (`in_801`):** first pinion a straight bevel; straight radial teeth; spiral later. **Proposed, awaiting approval:** Gear > **Crown gear** with Teeth, Module, Pressure angle, Inner radius, Outer radius, Thickness, Bore; "Mesh gear" on a crown makes a straight bevel pinion of the chosen teeth (at least 17 virtual teeth, else refused as undercut) placed at shaft angle 90 degrees plus its pitch angle, linked as the bevel pair is. Inner radius limited so the tooth tip is not pointed. Built as the prototype is (teeth lofted, plate fused); cone cut retried at other shifts when the kernel refuses.

## Rationale

`prototypes/crown-gear` showed the pair conjugate in the kernel (overlap about 1 mm3 at the place against over 100 half a pitch round). The numbers and menu place are my proposal; the human has not yet approved them.
