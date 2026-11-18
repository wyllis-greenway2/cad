---
id: dec_spiral_bevel_gears
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_829, in_817, in_809, in_767
date: 2026-11-17
depends_on:
  - dec_bevel_gears: the spiral bevel gear is the straight bevel gear with a curved tooth: the body, the pair linking, the Mesh gear and the speed rules are that decision's
  - dec_crown_gears: the tooth is generated from a crown gear (circular-arc teeth), the flat gear that decision's tool makes with straight ones
alternative_to:
---
# Spiral bevel gear tool (accepted in_829; built)

**Proposed:** Gear > Spiral bevel, a bevel gear record with a spiral angle (mean, default 30 degrees) and a hand, its tooth surfaces from the gearing law of Stadtfeld chapter 2 (the crown gear's circular-arc flank enveloped by the pinion, the ring by the pinion), the body a loft of tooth sections cut by the cone-end blank, as `prototypes/bevel-spiral-generated` does. **Limits (measured there):** seven pairs between 16 and 45 teeth mesh to within 4 mm3 of overlap at their place (against 357 to 454 mm3 half a pitch round); refused: a ring cone steeper than about 65 degrees (17/43 fails: the kernel's cone cut), more than 56 teeth in all (the largest that worked is 22/34; 28/42, 30/45 and 25/50, 70 to 75 in all, failed, two by running the kernel out of memory: the true limit is between 56 and 70), shaft angles other than 90 degrees, a profile shift (not tried). The cone cut is fragile (a failed boolean can corrupt the kernel): the tool would try several cone shifts and report failure. **Not proposed:** hypoid (the offset geometry is not read yet).

## Rationale

The prototype shows the pair conjugate in the kernel for the tooth counts above; the limits are what failed. This is my proposal; the human has not approved it, and it waits for the human.

## As built (`in_829`)
Gear > **Spiral bevel** (`tool:spiral`). A spiral bevel gear is a **bevel gear record** with `bevel.spiral` (the mean spiral angle, degrees; default 30, 15 to 45) and `bevel.cone`; its pair (`spiralFor`, `spiral.ts`: the prototype's gearing-law maths rewritten) is worked out from the two tooth counts (the one with fewer teeth the pinion; with equal teeth the partner, which has a direction, the ring gear). Fields: Teeth, Mate teeth, Module (the normal module at the middle of the face), Spiral angle, Backlash (0.05 mm by default), Bore (+ flat, key); fixed: 90 degree shafts, 20 degrees, the face 0.3 of the mean cone distance, the cutter 0.88 of it. Mesh gear, linking (the pair's teeth, spiral angle and backlash follow either gear's box) and re-seating are the bevel gear's, the partner's phase from the pair's place (`meshBevel`: no tooth to snap to, the surfaces are conjugate at any roll). Body (`spiralscene.ts`): a smooth loft through nine planes across the axis (ten sides to a tooth: four arcs a flank, one across the tip, one across the root) intersected with the blank of the two back cones. **Limits, refused with the reason:** pinion under 16 teeth, more than 56 in all, ring over 2.05 times the pinion, angle outside 15 to 45, shafts other than 90 degrees, pressure other than 20. **The kernel's cone cut** fails for some places of the cones and not others, depending on where the gear stands: `SPIRAL.shifts` are tried in turn (`spiralretry.ts`, in `run` and in `refresh`) and the one that works is kept in the gear (`bevel.cone`), so a saved file does not try again. **Measured** (`app/test/spiral.test.ts`, by Mesh gear): 20 / 30 module 3: overlap about 1 mm3 at its place, 379 half a pitch round. **Not built:** hypoid, other shaft angles, a profile shift, a root fillet.
