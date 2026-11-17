---
id: dec_chamfer_arc_ends
kind: decision
status: accepted
origin: human
human_input: in_502, in_503, in_655
date: 2026-11-16
depends_on:
  - dec_edits_saturate: a chamfer or fillet too big for the kernel's own round is made as a region that is cut (`regionRound`, `rimTool`); the sliver is a result of how that region ends
alternative_to:
---
# A chamfer of a rim that is only an arc ends flat across it, and may leave thin slivers at its ends: left as it is

**Decided (`in_503`): leave it.** The human asked only to be sure it was not a bug; it is not (valid, closed, no crossing), so the round of a rim that is only an arc keeps ending in a flat cut across it, as a round ends at a vertex, and the fix below is **not** built. It stays written down in case slivers become a problem.

**What was seen (`in_502`, fixture `test/fixtures/face-shift-ears-in_502.cad.json`):** a block with a round hole cut down through it; the side face is pushed in until the hole breaks out through it (the hole's rim is now an arc, ending on that side wall at a shallow angle, because the hole's centre is only 0.75 mm outside the wall); a 3.6 mm chamfer of the arc. The kernel's own round cannot be made at that size, so it is made as a region (`rimTool`): the profile is turned about the hole's axis **through the span of the arc only**, so the cut ends in a flat plane through the axis at each end of the arc ("as a round ends at a vertex"). Where the side wall is nearly in that plane, a thin wedge of the original top is left between the plane and the wall, standing at full height beside the scoop: 0.13 and 0.24 mm wide, about a millimetre long, in the picture thin fins ("ears"). Not a broken body: valid, closed, no crossing; it is what the cut leaves.

**Experiment (not built):** turning the profile all the way round (360 degrees) instead: 10 faces instead of 14, the slivers are gone, 0.7 mm³ less material, a closed mesh. A full turn is wrong in general: where the rim's circle goes on past the arc's ends close to other material (a body with another part of it within the size of the circle), a full turn would cut that too.

**The fix that was proposed (not built, not wanted for now):** carry the turn on past each end of the arc only as far as it takes to leave the body: at the arc's end the arc stops because the round wall is cut by a flat face; turn on until the profile's farthest radial line (at the rim's radius plus the size) lies wholly on the outer side of that flat face. That covers the sliver and nothing else; with no such flat face (the arc ends at a vertex between two round faces, say) the round ends flat across as it does now.

## Changed in part (`in_655`: the human asked for the fallback chamfer of a swept body to be fixed)

The rule above stands for an arc that ends against **a wall** (a round that really ends): it ends flat across the arc. Two other ends are now cut by a plane that is not the one across the arc, because the flat cut across the arc there leaves a wedge standing (a swept bend's chamfer left twelve flat triangles of half the size squared, `in_653`): (1) **two pieces of a rim that meet** (the arcs of a sweep's long edge, where two cylinders of different radius meet at a kink) are both cut by the plane that halves the angle between them, so they meet and nothing stands between; (2) an arc that ends **against one flat face that closes the edge there** (the end of a sweep, a cap that is not square to the arc) is cut by that face's plane. Where the plane is the one across the arc already (tangent pieces, a face square to the arc) or where the next piece is not a rim (a straight side of the outline) the flat cut across the arc stays as it was. `rimEnds` and `rimTool` in `interpreter.mjs`; `test/sweepchamfer.test.ts`.

## Rationale

The region is a cut that follows the arc; at an end that lies on a wall, the cut should reach the wall, as a chamfer of the whole circle would have. The slivers are valid geometry, and a fix would change the shape of every chamfer and fillet of an arc of a rim made as a region (a round that really stops at the arc's end would be changed too): not worth it for a case the human did not ask to change.
