---
id: dec_chamfer_region_reach
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_504, in_505, in_506
date: 2026-11-16
depends_on:
  - dec_edits_saturate: a chamfer or fillet too big for the kernel's own round is made as a region that is cut (`regionRound`); this is about how far along the edge that region reaches
alternative_to:
---
# A chamfer made as a region ends at the faces that close its edge, as the kernel's round does

**Decided (`in_506`, after the continuity test of `in_505` showed the break at the handover to the region in 26 round steps):** a chamfer or fillet of a **convex** straight edge made as a region (`regionRound`, a cut) is a long prism of the round's profile **cut off by the planes of the faces that close the edge at its two ends** (the one other face at each end corner, when it is flat; the body side of its plane, and a hair beyond it), not a prism that stops a millimetre past the ends of the edge. A round bigger than the faces beside the edge are wide then carries on, as a plane, across the corner. Where an end has no one flat face, or the size changes along the edge, or the edge is concave (added material), the flat cut of before is kept. The first try (a prism as long as the faces beside the edge) was wrong: it cut beyond the ends of a short edge between long faces (`channel-block.cad.json`), which the continuity test caught; the end faces' planes are where the kernel's round stops.

**What was seen (`in_504`, fixture `test/fixtures/chamfer-continuation-in_504.cad.json`):** a second chamfer, on the edge between the 45-degree face of an earlier chamfer (3.5 mm) and the front face. The size is pushed up: from 3.3 to 5 mm the kernel's own chamfer is made and the cut is one plane across the corner; from 5.5 mm the kernel cannot make it and the step is made as a **region** (`regionRound`, the step's note says so): a prism of the chamfer's triangle, run along the edge and **1 mm past each end** (`margin`), so the cut is a flat strip that ends short of the corner, while the plane would go on cutting across the faces beside it. The volume then goes **up** with the size (2016.99 mm3 at 5, 2026.04 at 5.5, which is less taken off by a bigger chamfer), and the faces change (14, then 13).

**The experiment, with the faces' own length (not the rule above):** let the prism reach as far along the edge as the two faces beside it reach (their farthest vertex along the edge, past the ends of the edge) and a hair more, for a cut (convex edge); a region that is added keeps stopping at the ends. On the file: 4.5 mm 2036.09, 5 mm 2016.99, 5.5 mm 1995.78, 6 mm 1972.37, 6.9 mm 1924.25, 8 mm 1853.83 mm3: one plane going on across the corner, smooth, falling with the size, as a push of the chamfer face is expected to behave. The same numbers come from a prism 100 mm longer. It cut beyond the ends of a short edge, and was dropped.

## Rationale

A push of a chamfer should be the plane carried on, and the region's prism was shorter than the plane would be. The change touches every convex chamfer or fillet of a straight edge made as a region; the continuity test (`test/roundcontinuity.test.ts`) and the region tests pass with it, and the case of `in_504` is one of its hard checks now. The other breaks the sweep found (a fillet on a cylinder's rim, a stadium chamfer, a hollow's fillet) have other causes and are still known breaks.

## Built: a concave round follows the outline of its faces (`in_1340`, for review)
The human asked why a chamfer in the corner between a wall and the floor of a flat cut on a round body could not go all the way ("it wants to keep this little sliver of flat or it fails"). The floor of such a cut is a circle's segment: 4.5 mm across at its widest, nothing at its ends. The kernel's chamfer stops at 4.45 mm (a sliver of floor is left, and it fails past it), and the region that is meant to take over limited its reach by the farthest *vertex* of each face, which for the floor is zero (its curved side has no vertex), so it made nothing. Now the fill of a concave straight edge is made at the full size and cut back to what lies above the two faces (each face pushed out along its normal, and the fill kept inside both), so it follows the floor's outline up the round wall instead of standing out past it. A bigger size then fills more, the chamfer plane meeting the round wall. The limit by vertices stays for the cases that do not use it (a size that changes along the edge). Test: `chamferflat.test.ts` (the human's model).
