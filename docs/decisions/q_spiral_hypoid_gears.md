---
id: q_spiral_hypoid_gears
kind: question
status: open
origin: ai-unreviewed
human_input: in_767, in_766
date: 2026-11-17
depends_on:
  - dec_bevel_gears: a spiral bevel gear is the straight bevel gear with a curved tooth; the body, the pair linking and the speed rules are that decision's
  - prin_manufacture_agnostic: the geometry is the tooth, not a machine's setting; nothing per manufacturing route
alternative_to:
---
# Spiral bevel and hypoid gears: what is known, what a simple model did, what is needed

**Asked (`in_766`):** work on spiral bevel and hypoid gears. Not built; no code outside `prototypes/` (a gear needs an accepted entry first).

**Found (web search; the pages not read):** a spiral bevel tooth's lengthwise centre line is theoretically a logarithmic spiral that a circular arc (the cutter's radius, a little under the mean cone distance) approximates closely (NASA papers on circular-cut spiral bevel surface geometry, open on ntrs.nasa.gov); the spiral angle at a cone distance follows from the mean angle and the cutter radius (the formula of the backlash article already read); a worked example is in Gear Technology, August 2015, "chapter2.pdf" (30 degrees, cutter radius 76.2 mm, 13 / 35 teeth). **ISO 23509 holds the formulas for spiral and hypoid in one set** (the hypoid offset entered as zero gives the spiral bevel; section 5.9 the hypoid geometry and the crossing point; paywalled). A hypoid's pinion is offset from the wheel's axis, so the pitch surfaces are not cones, the spiral angles of the pair differ and the offset reaches 25 per cent of the wheel's pitch diameter (commercial references).

**Tried (`prototypes/bevel-spiral`):** the straight tooth's sections turned by the developed angle of the circular arc, lofted. The spiral angle formulas test; a pair of opposite hands **overlaps by 13 to 15 mm3 whichever the hands** where the straight pair has none, so the simple model is not a conjugate pair. A generated spiral bevel pair is not two sweeps of one profile.

**Decided by the human (`in_767`): no approximate spiral bevel gear; wait until the surfaces can be derived from the papers, "build it right".** Nothing is built until then. **Access (`in_767`):** `ntrs.nasa.gov`, `lirias.kuleuven.be` and `www.geartechnology.com` were added to the `cad` environment (the human approved the change); the shell's download was then refused by the automatic safety check (not worked around) and the web fetch tool could not resolve `ntrs.nasa.gov` ("getaddrinfo ENOTFOUND"): so the human sends the PDFs.

**Needed to go on:** (1) the NASA circular-cut spiral bevel papers (Huston and Coy, and Litvin; open PDFs: https://ntrs.nasa.gov/api/citations/19820018805/downloads/19820018805.pdf, https://ntrs.nasa.gov/api/citations/19810017922/downloads/19810017922.pdf, https://ntrs.nasa.gov/api/citations/19830024896/downloads/19830024896.pdf) for the tooth surface equations; (2) Gear Technology "chapter2.pdf" (https://ik.imagekit.io/agmamedia/gt/issues/0815x/chapter2.pdf) for the worked example to check against; (3) ISO 23509 sections on the pitch cone, the cutter radius and the hypoid geometry (paid) or "The intrinsic pitch cones in hypoid gears" (AGMA media, https://ik.imagekit.io/agmamedia/2025/10/09/the-intrinsic-pitch-cones-in-hypoid-gears_rmx2WSkU4.pdf). **A decision for the human:** a spiral bevel as a clearly marked approximation (a curved tooth that looks right and is not conjugate), or only when its surfaces are derived from the sources above.

## Rationale

Spiral bevel and hypoid gears are the usual quiet drives for a right angle, and the human asked for them (`in_719`, `in_766`). The first measure says the cheap model does not mesh, so this record does not build it: it keeps the sources needed and the choice that is the human's.
