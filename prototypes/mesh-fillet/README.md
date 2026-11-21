# mesh-fillet (THROWAWAY prototype)

Spike 2 of the engine thinking (`in_1463` to `in_1469`). Decides nothing by itself; never import this code from production code (CLAUDE.md rule 9).
Uses `manifold-3d` 3.5.5 (Apache-2.0, `docs/licenses.md`); `npm install` here. The OCCT comparisons import `../lineage-occt/lib.mjs` (spike 1, with its `node_modules` symlink).

**Meant to learn:** on a mesh-boolean kernel (Manifold), (1) do face ids survive operations, (2) can fillets be made by plain booleans and match the exact answer, on any
orientation and angle, in chains, (3) how robust are the booleans themselves, and (4) what does the construction not cover?

## Run
`node spike2.mjs` (fillets against closed forms), `node spike2b.mjs` (against OCCT, a random-boolean fuzz, a chain with ids under edits), `node t3.mjs` and `node t4.mjs` (a chain of fillets round a rounded rectangle).

## What is here
- `mf.mjs`: `tag` (face ids ride Manifold's `faceID`), `faces` (a face is the triangles of one id, split into connected pieces, ranked bigger first), `fillet` (one straight edge between two flat faces: the corner piece is extruded along the edge and subtracted, or added when the edge is concave), `filletLoop` (every edge of a face at once, trimmed at mitre planes), `rimFillet` (revolved), `clean` (drops dust pieces).

## What it learned
**Held.**
- **Face ids survive.** Manifold carries a per-triangle `faceID` through booleans and turns, so lineage at face level is close to free: a cut, a hole, a rotation, a fillet all kept every input face's id on its triangles.
- **Booleans did not fail.** 6063 random booleans (cubes, cylinders of 6 to 64 sides, spheres, any rotation, half-millimetre grid so flush faces were common, 20% of operations 1e-9 off): 0 status errors, 0 volume-identity violations (union, difference, intersection each checked against inclusion-exclusion to 1e-6), about 690 operations a second with two extra booleans per check.
- **Fillets by construction match the exact answer.** A straight edge, 90 degrees, r 1 to 4, plain and turned about a skew axis and 37 degrees: removed volume within 0.15% of r² (1 - pi/4) L (the arc is 32 chords, so slightly over). Prism edges at 60, 90, 108 and 120 degrees: within 0.17% of r² (cot(g/2) - (pi - g)/2) L. A concave inner corner (filled in, kept between the planes of the two end faces), plain and turned: 0.147%. A radius too big is refused with the most that fits (checked at 9, 10, 11, 25 on a 10 high wall).
- **Against OCCT on the same body:** one convex edge -0.001%; an edge ending on a slanted face -0.001%; three edges at a corner +0.011% (OCCT blends the corner with a sphere patch, this leaves the three cylinders meeting, so the shape differs a little where the volume does not).
- **A chain with ids, replayed under 12 edits** (box, fillet, a hole, a second fillet): 69 references right, 0 wrong, 3 lost where a fillet was refused as too big. A refused fillet left the model valid and the later steps ran.
- **A chain of fillets round a rounded rectangle** (68 or 128 straight edges meeting at tessellated corners): volume within 0.14% of exact, once each piece is trimmed at the mitre plane to its neighbour.

**Did not hold, or needs a rule.**
1. **Valid does not mean clean: dust.** 20 of 6063 random results (and 17 to 23 pieces of every fillet chain) carried separate pieces of 1e-8 mm³ and less. The engine must drop pieces below a volume threshold after every step (`clean`).
2. **Tools that only touch can leave a fin.** Pieces trimmed exactly at their mitre planes left hairline fins: the cleaned result had genus 30 to 47 (it should be 0). Overlapping neighbouring pieces by 1e-4 to 1e-2 mm gives genus 0. A rule found by trying, not derived.
3. **A fillet that continues a chain cannot use the overlong tool.** Done edge by edge it cut into the neighbouring edges (only 4 of 68 done, 38% of the volume). The chain needs its joints found and trimmed: the special-case work that was the old kernel's `rimTool`. Not done: a chain that mixes convex and concave edges, edges ending on curved faces, a radius that changes along the edge, a setback or a true vertex blend.
4. **Which way a face lies from its edge cannot come from the face's centre** (an L-shaped face's centre can be on the wrong side of the edge). Read from the triangle that touches the edge. And the "does the radius fit" check used the face's farthest vertex, which is right for a rectangle and too generous for a face that narrows.
5. **Split faces are ambiguous, here worse than in OCCT.** A hole through a wall gives `101.0` and `101.1` of exactly equal area; the first is picked by an arbitrary tie-break, so the reference "101.0" resolves, silently, to one of two symmetric halves. A split must be reported, and a step that needs one face must ask.
6. **A curved face is one face by id, not by connectivity.** A fillet chain's round face came out in 40 to 80 connected pieces. The face is the faceID; connectivity is only for deciding whether a flat face split.
7. **A tessellated rim does not meet a revolved fillet exactly.** A fillet revolved with 48 or 100 segments on a 64-sided body: valid, volume 0.06% and -0.7% off. Same count and phase: +0.4%. Curves are chords, and the error is the chord's.

**Not tested.** Sweeps, lofts, shelling and offset (Manifold has extrude and revolve; the rest we would build); chamfers (the same construction with a straight profile, so expected to work); fillets between a flat face and a tessellated curved face other than the revolve special case; how the result looks (the creases at the mitre joints were not looked at); big meshes and speed beyond the fuzz; STL and 3MF export (a mesh kernel makes it trivial); the sketch side.
