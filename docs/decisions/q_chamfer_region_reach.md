---
id: q_chamfer_region_reach
kind: question
status: open
origin: ai-unreviewed
human_input: in_476
date: 2026-11-16
depends_on:
  - dec_edits_saturate: a chamfer or fillet too big for the kernel's own round is made as a region that is cut (`regionRound`); this is about how far along the edge that region reaches
alternative_to:
---
# A chamfer made as a region stops 1 mm past the ends of its edge: let it reach as far as the faces beside the edge

**What was seen (`in_476`, fixture `test/fixtures/chamfer-continuation-in_476.cad.json`):** a second chamfer, on the edge between the 45-degree face of an earlier chamfer (3.5 mm) and the front face. The size is pushed up: from 3.3 to 5 mm the kernel's own chamfer is made and the cut is one plane across the corner; from 5.5 mm the kernel cannot make it and the step is made as a **region** (`regionRound`, the step's note says so): a prism of the chamfer's triangle, run along the edge and **1 mm past each end** (`margin`), so the cut is a flat strip that ends short of the corner, while the plane would go on cutting across the faces beside it. The volume then goes **up** with the size (2016.99 mm3 at 5, 2026.04 at 5.5, which is less taken off by a bigger chamfer), and the faces change (14, then 13).

**Experiment (not built; the suite passes, 812):** let the prism reach as far along the edge as the two faces beside it reach (their farthest vertex along the edge, past the ends of the edge) and a hair more, for a cut (convex edge); a region that is added keeps stopping at the ends. On the file: 4.5 mm 2036.09, 5 mm 2016.99, 5.5 mm 1995.78, 6 mm 1972.37, 6.9 mm 1924.25, 8 mm 1853.83 mm3: one plane going on across the corner, smooth, falling with the size, as a push of the chamfer face is expected to behave. The same numbers come from a prism 100 mm longer. Not tried: a body where the edge's faces are long and an end of the edge meets a concave step.

## Rationale

A push of a chamfer should be the plane carried on, and the region's prism is shorter than the plane would be. Asked, not decided: the change touches every convex chamfer or fillet made as a region (it reaches further along its edge).
