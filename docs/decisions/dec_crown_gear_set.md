---
id: dec_crown_gear_set
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_886, in_878
date: 2026-11-19
depends_on:
  - dec_crown_gears: the set is that tool and its variations; the pinion, linking and body are that decision's
alternative_to:
---
# A set of crown gears (accepted in_886: the face gear is built; the spiral crown is not)

**Why the pinion does not stand at 90 degrees:** a crown gear with a straight bevel pinion has the shafts 90 degrees plus the pinion's pitch angle apart (`sin = pinion teeth / crown teeth`: 116.7 degrees for 18 and 40), because the pinion's cone must touch the crown's flat face along a line through the apex. That is the geometry, not a fault. **Recommended set:** (1) **Crown gear** (as built): straight teeth, a straight bevel pinion at that angle; (2) **Face gear**: a spur pinion at exactly 90 degrees, axes crossing (the usual right angle drive; the tooth is not a plane but the envelope of the pinion's involute, by the same gearing law as `prototypes/bevel-spiral-generated`); (3) later: a crown with curved teeth and a spiral pinion. **Polish for (1):** the box says the angle the pinion stands at; defaults that suit a print.

## Rationale

The human asked for 90 degrees; only the face gear gives it. It is a recommendation, so it stays provisional until the human has seen it; the face gear starts as a prototype (`prototypes/face-gear`), which needs no decision.

## Face gear prototype result (`prototypes/face-gear`)
A face gear and its spur pinion (14 / 40 teeth, module 2, radii 40 to 46) are conjugate in the kernel: overlap 2.0 mm3 at the place, 2.1 rolled, 49.2 half a pitch round. The tooth is the envelope of the pinion's involute (not a plane); the inner radius is limited by where the envelope exists, the outer by the tooth becoming pointed. **Proposed for the human to approve:** Gear > Face gear (Teeth, Pinion teeth, Module, Pressure, Inner radius, Outer radius, Thickness, Backlash, Bore), a gear record like the crown's with a spur pinion at 90 degrees from Mesh gear; refused with the reason where the envelope does not exist or the teeth are pointed. Not built: nothing outside `prototypes/` yet.

Four more pairs (18/50, 20/60, 16/32 at module 3, 12/36) mesh too: overlap 0.4 to 3.8 mm3 at the place against 49 to 146 half a pitch round. The radii used run from the pitch radius outward 3 to 4 modules.

## As built (`in_886`)
Gear > **Face gear** (`tool:face`). A face gear and its spur pinion are **bevel records** with `bevel.facegear` ("gear" or "pinion"; shaft 90 degrees, pressure 20 degrees only), so Mesh gear, linking (`with`, `dir`, `frame`) and re-seating are the bevel gear's (`meshFace` in `mesh.ts`, `setGear` dispatching on it). Fields of the face gear: Teeth (40), Pinion teeth (14), Module, Inner radius, Outer radius, Thickness, Backlash (0.05), Bore (+ flat, key); the pinion's: Teeth, Face gear teeth, Module, Backlash, Bore (its radii are the face gear's). Radii: inner the pitch radius, outer the longest the tooth allows up to three modules out (a quarter module less at a time; the tooth is thinnest at its outer end, more so for a bigger pinion). **Limits, refused with the reason:** pinion under 12 teeth, face gear over 64, face gear 2 to 3.1 times the pinion, inner radius under the pitch radius less a module, outer over the pitch radius and 4 modules, teeth pointed at the outer end, no envelope at the inner end. Face gear body (`facescene.ts`, `face.ts`): a smooth loft through five heights (the tooth is the pinion's envelope: curved) cut by a revolved blank (a thin hub joins the teeth) and joined to a plate; the spur pinion an extrusion of a spur outline along a radius of the face gear, a millimetre longer than the face at each end. **Measured** (`app/test/face.test.ts`, by Mesh gear): 14 / 40 module 2: overlap 2.2 mm3 at its place, 52 half a pitch round; made from the pinion's side, 1.1 and 51; linked edit (pinion to 16 teeth): 1.0. A face gear of 40 teeth takes about 16 s in Node to make. **Not built:** a spiral crown, helical or other pinions.

**The spiral crown (`in_988`):** built, `dec_spiral_crown`.
