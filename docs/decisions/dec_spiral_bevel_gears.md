---
id: dec_spiral_bevel_gears
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_809, in_767
date: 2026-11-17
depends_on:
  - dec_bevel_gears: the spiral bevel gear is the straight bevel gear with a curved tooth: the body, the pair linking, the Mesh gear and the speed rules are that decision's
  - dec_crown_gears: the tooth is generated from a crown gear (circular-arc teeth), the flat gear that decision's tool makes with straight ones
alternative_to:
---
# Spiral bevel gear tool (proposal, not approved; nothing built in `app/`)

**Proposed:** Gear > Spiral bevel, a bevel gear record with a spiral angle (mean, default 30 degrees) and a hand, its tooth surfaces from the gearing law of Stadtfeld chapter 2 (the crown gear's circular-arc flank enveloped by the pinion, the ring by the pinion), the body a loft of tooth sections cut by the cone-end blank, as `prototypes/bevel-spiral-generated` does. **Limits (measured there):** seven pairs between 16 and 45 teeth mesh to within 4 mm3 of overlap at their place (against 357 to 454 mm3 half a pitch round); refused: a ring cone steeper than about 65 degrees (17/43 fails: the kernel's cone cut), more than about 60 teeth in all (30/45 ran the kernel out of memory), shaft angles other than 90 degrees, a profile shift (not tried). The cone cut is fragile (a failed boolean can corrupt the kernel): the tool would try several cone shifts and report failure. **Not proposed:** hypoid (the offset geometry is not read yet).

## Rationale

The prototype shows the pair conjugate in the kernel for the tooth counts above; the limits are what failed. This is my proposal; the human has not approved it, and it waits for the human.
