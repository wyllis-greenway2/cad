---
id: dec_piston_skirt
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1264
date: 2026-11-20
depends_on:
  - dec_piston_maker: the skirt's shape variables, made typed fields
  - dec_piston_lands_clips: the lands are relieved from the skirt's top radius; the circlip grooves are placed from the skirt's outer face at the pin
  - dec_piston_hollow: the skirt is the hollow piston's wall below the ring belt
alternative_to:
---
# The skirt's shape: oval, tapered, a chamfered foot, and a full or two-pad style

The human approved (`in_1264`). Built, **assumed** except where a source gives the kind of shape:

- **Skirt shape** (a typed choice, default **Oval, tapered**; the other, Round, is the plain cylinder): the skirt is **narrower along the pin than across it** (**oval**, 0.001 of the bore across by default: NACA 817 has 0.006 in along the pin on a 6.1 in piston; cartecc's cold clearance along the pin is double that across it) and **narrower at the top than at the foot** (**taper**, 0.0007 of the bore across by default: cartecc's clearance is 0.2 and 0.1 mm at the top of the skirt, 0.1 and 0.05 mm at the bottom). The reference diameter (Honda's skirt O.D., measured 10 mm above the foot across the thrust) is the **foot's** diameter. Both are typed numbers, 0 = auto.
- **Foot chamfer:** 0.004 of the bore (0 = auto, typed); a break at the skirt's lower edge.
- **Style** (typed choice): **Full** skirt, or **Two pads** (the skirt cut away at the two sides of the pin below the pin bosses, leaving a pad on each thrust side, each spanning a typed **pad angle**, 0 = auto 80 degrees: the Caterpillar patent's 70 to 90 degrees, 77 in its example). Pads need a skirt long enough below the bosses.
- **The piston's outer body is now turned** (a profile revolved about the piston's axis), so the taper and the chamfer are in it; the oval is a cut. The lands' relief is taken from the skirt's top radius. The circlip grooves are placed from the skirt's outer face at the pin (the pin height's radius along the pin axis, which the oval and the taper lower slightly).
- **Not built:** a barrel profile, skirt windows and lightening holes, the cam-ground (variable) oval, a coating's thickness.

## Rationale

The human chose the skirt. The oval and the taper are what every sourced real piston has (NACA 817, cartecc, Scraba, Enginelabs), with the size assumed; the pad style is the one the Caterpillar patent describes. The turned body is the simplest way to a tapered, chamfered skirt, and the checks (the kernel's volume against a worked-out one) are kept.
