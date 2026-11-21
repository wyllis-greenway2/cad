# line-engine (THROWAWAY prototype)

Spike 4 of the engine thinking (`in_1463` to `in_1474`). Decides nothing by itself; never import this code from production code (CLAUDE.md rule 9).
Uses spike 1's OCCT helpers (`../lineage-occt`, with its `node_modules` symlink) and spike 3's graph engine (`../replay-graph/engine.mjs`).

**Meant to learn:** does the human's line idea work end to end on OCCT? A sketch line and a body edge are one kind of thing to a constraint; a line drawn on a face becomes a real edge of the body (the face splits into regions that can be extruded differently); every later step refers to faces and edges by lineage id; and an edit upstream cascades through the graph.

## Run
`node run.mjs` (the recipe replayed under 15 edits in four variants).

## What is here
- `recipe.mjs`: the steps. A rectangle sketch (`sketchRect`) is extruded (`extrude`); a line is sketched on the top face placed by its distance from an edge named as a body edge key or as a line of the first sketch (`sketchOnFace`, `resolveEdge`); the line is imprinted into the body (`imprint`: OCCT's splitter with history, so the face really splits); one region is extruded (`extrudeRegion`); a wall is pushed (`push`); a driving dimension between two faces (`dimension`); a fillet by the two faces beside the edge (`fillet`). `linesOf` lists sketch lines and body edges the same way. Optional: a 37 degree turn of the body about a skew axis before the line is sketched, and a second line placed from the first line's seam edge (which splits a face that a later step refers to).
- `run.mjs`: builds the recipe through spike 3's graph engine and checks seven references per run against what a person would say they still mean.

## What it learned
**Held.**
- **360 reference checks** (15 edits x 4 variants x 6 references): **324 right, 0 wrong, 36 lost**. The edits: width, depth, height, the line's distance (6, 12, 20), the tower, the driving dimension (35, 50, 70), the fillet, all together, the line off the face, the line on the face's edge, a fillet too big. The 36 lost are exactly where the edit removes the thing (the line off the face or on its boundary leaves no region; a fillet too big for the body). Failure stayed contained: the step is flagged, the model stays valid, steps that do not depend on it still run.
- **The line becomes a real edge.** After the imprint the seam between the two regions is an edge of the body (an edge index entry between the left face and the wall of the raised region) and its place followed the line's distance through every edit, turned or not. The final body has 21 edges, listed beside the sketch lines in one list.
- **A reference to a face that has split resolves to its pieces.** A second line cut the top-left face again; the fillet that named it was applied to every edge between its pieces, and a reference check read all the pieces. The rule "a parent id resolves to a set" worked in a real chain.
- **A turned body.** The same recipe after a 37 degree turn about a skew axis: all of the above held once the numbers were exact.
- **Cost.** Editing the line's distance recomputed 2 of 7 steps in 4 to 5 ms through the graph with cutoff.
- **A driving dimension keeps its meaning:** widening the base to 60 or narrowing it to 30 leaves the width at 50, because the later dimension step wins (it pushes the wall back or out).

**Did not hold, or needs a rule.**
1. **Exact numbers again, now in the line system.** The sketch frame's origin came from a face centre rounded to 1e-4; the line sat a hair off the plane and OCCT's splitter silently did nothing (every turned run lost its regions). The third time this class of fault appeared (spike 1: a rounded normal; here a rounded centre): numbers that feed a kernel call must never come from a rounded fact.
2. **A distance from an edge carries parallelism.** The line was first placed using the world x axis projected into the face; on a turned body that is not the reference edge's direction and the line came out skewed (26.3 where 28 was meant). A distance constraint to an edge must make the new line parallel to it; the sketch frame is built from the reference edge.
3. **A flagged step must pass through a value of its own output type.** A flagged sketch step passed the body (its first input) on; the imprint after it then failed with a type error instead of a clear reference error. Contained, but the pass-through rule must be per kind of step.
4. **Orphans cascade.** With the line off the face, the region extrude, the second sketch, the second imprint and the fillet were all flagged (one cause, four flags). The rebind offer I wrote is crude: it found the unsplit top face for an axis-aligned body and nothing for a turned one (it compared against a world direction); it is not evidence that rebinding works.
5. **Ids built by joining strings are ambiguous.** An edge key is its two face ids joined by `|`, and a face id made from an edge key (`C:side:A:end.0|A:end.1`) already contains `|`, so keys have three or more parts. It worked here by luck of what was looked up; ids must be structured values, never joined text.
6. **Child ids read oddly and rank by a position tie-break** (`A:end.0.1`): the same unsolved question as spike 1 (what orders the children of a split stably).

**Not tested.** A 2D constraint solver (only a placed distance, no network of constraints, no arcs or circles); sketching on a curved face; the user interface for a flagged or orphaned step; a body with thousands of faces; imprinting a closed loop of lines (a region from a rectangle drawn on a face, with its inner and outer pieces); mixed upstream edits that reorder the sketch's own edges.
