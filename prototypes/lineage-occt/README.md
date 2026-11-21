# lineage-occt (THROWAWAY prototype)

Spike 1 of the engine thinking (`in_1463` to `in_1468`). Decides nothing by itself; never import this code from production code (CLAUDE.md rule 9).

**Meant to learn:** can OCCT's own operation history (`Generated`, `Modified`, `IsDeleted`) give every face a lasting id through a chain of steps, so that a
later step's reference survives an edit to an earlier step (the cascade), without the positional naming and geometric fallback that failed in the old app?

## Run
`node chain.mjs` (a five-step chain replayed under 13 edits) and `node stress.mjs` (hole through a wall, vertex blend, partial coplanar merges, turned body, flush cuts, island face).
Uses the old app's kernel loader and its `node_modules` through a git-ignored symlink (`ln -s ../../app/node_modules node_modules`).

## What is here
- `lib.mjs`: a `Model` (a solid plus one `{id, raw}` per face); `carry` moves ids through an operation by its history; `prism`, `boolean`, `unify`; the edge index (an edge is the sorted ids of the two faces beside it).
- `chain.mjs`: sketch and extrude (A), split the top face by a line (B), extrude one half (C), push a wall (D), fillet an edge (E). A failing step is flagged and the model passes through.
- `stress.mjs`: the harder cases.

## What it learned
**Held.**
- The chain, 13 edits (widths, a line moved, drawn the other way, push, fillet size, all together): **87 references resolved to the right face, 0 to a wrong one, 4 lost**, and the 4 are where the edit removed the thing (the line moved off the face; a fillet too big for a thin body). Failure stayed local: the step is flagged, the later steps still ran, and the model stayed valid.
- OCCT's history was complete for the prism, fuse, cut, splitter, fillet and transform in every case tried: no face without an id, except the corner patch of a vertex blend, which only appears if `Generated` is asked about the *vertex*.
- Flush cuts (0, and 1e-7 proud or short), a body turned 37 and 90 degrees then pushed, unified and filleted, a hole breaking through a wall, partial coplanar merges: all valid, no gaps.
- Edge ids as the pair of the two face ids beside the edge survived every edit in the chain (the fillet found its edge each time).

**Did not hold, or needs a rule.**
1. **Faces that split lose their parent id.** A hole breaking through a wall splits the wall into two faces; the old id resolves to nothing. The engine must resolve a parent id to its set of children and ask the user when a step needs one face.
2. **The coplanar merge (`ShapeUpgrade_UnifySameDomain`) has no history in this wasm build.** Ids are recovered by exact area overlap (a boolean common per face); that worked in every case here, including an island face inside a ring. A box test is weaker (I expected it to fail on the island and replaced it before running it, so that failure is not shown). The alternative is to bind the class's `History()` in our own wasm build.
3. **Numbers read from a face must be exact.** My first harness rounded a normal to four digits, the pushed prism was a hair off, nothing merged and the turned body failed: the old app's `faceParams` bug again. A rule, not a kernel fault.
4. **Ranking children by centroid ties** for concentric faces (a ring and its island have the same centre of mass). The canonical order needs another key (area, then box).
5. **Ids built from position collide** (a hole's two cylinder walls got one id in my harness). The engine must enforce unique ids.

**Not tested.** Edge-level history from OCCT itself (edges were derived from face pairs); curved faces pushed; sweep, loft, shell, offset; speed and size; sketch edits that reorder a sketch's edges; the rebind user interface; the mesh route (spike 2).
