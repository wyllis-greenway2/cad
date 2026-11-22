# Engine review for simplification (`in_1533`, 2026-11-22; AI's reading, not reviewed by the human)

Measured: `next/src/engine` is 306 KB in 3 500 lines (the lines are long; formatting is a separate matter); 42 dev checks, 2 600 lines. Nothing here changes behaviour; each item is done under the existing checks.

**Done (`in_1534`, `in_1535`): items 1, 2, 3, 4, 5, 6, 7 and 9** (marked *done*); 8, 10, 11 are left.

## Merge or generalise (the real duplication)
1. *done* **The two solvers repeat the verdict code.** `solver.ts` (solveOnce) and `placement.ts` (place) each build the unknowns, run the restarts, find the rank, the null space, the free owners, the redundant and implied constraints and the conflict by QuickXplain. They share a `kit` of helpers, not the analysis. One `analyse(problem)` over `{ names, x, frozen, rows, seeds }` returns the verdict; each solver only builds its rows. Saves about 60 dense lines, and every later relation (a third kind of part) gets the verdict free. Medium effort; the 2D solver checks (solver, sketch, refusal, range) and the placement checks pin it.
2. *done* **Per-kind facts live in three tables in three files**: `CHANGES` (clean.ts), `MAIN` (failure.ts), `REF` (scope.ts, patched onto the kinds at start-up by `scopeKinds`). Put them on the kind itself (`kinds[x] = { run, outputs, main?, changes?, names? }`): one place per kind, no start-up patching, a new kind cannot be forgotten. Small effort.
3. *done* **Putting a tool into a body is written five times**: make the tool, `fromClaims`, cut or fuse, `carry`, `unifyBody` (`hole.ts`, `pull.ts` twice, `steps.ts` `pushed` and `combine`). One `applyTool(body, tool, claims, mode, ctx)`. Small effort.
4. *done* **Asking the worker is three files per question**: `protocol.ts` (the union), `session.ts` (the branch), `host.ts` (the wait). A registry of asks (`asks[name] = (engine, args) => data`) leaves protocol and host alone when a question is added (there are nine). Small to medium.
5. *done* **Two canonical-JSON functions** (`document.ts` `sorted`, `params.ts` `canonical`): one. Trivial.
6. *done* **Vector helpers defined five times** (`curved`, `pull`, `steps` and two in the interaction layer): one `vec.ts`. Trivial.
7. *done* **`K.facts` is called again and again for the same face** (lineage 7, pull 8, steps 4, and the fingerprint, the sliver check, the snapshot, the mesh and `primOf` each read every face). Cache it on the face record. This is also the likeliest cheap win for the 0.5 s a step found in `in_1530`, and `changedNothing` computes two whole fingerprints each step: compare volume and face count first. Small effort, measurable.
8. **The sketch's old path (the drawing that is one closed chain keeps its order) beside the new region path.** Once regions exist the old path only keeps the sides' order. If the order is not something a later step relies on, delete it (about 15 lines and a special case). Needs a decision on side order; low risk with the checks.

## Smaller
9. *done* **23 dev checks repeat `check`, `near`, `st`, `body`** (and 17 `near`): `dev/lib.ts`.
10. **Relation names are in three places**: the solver's table, `suggest.ts` `NAMES`, `hold.ts` `HoldKind`. Derive the last two from the first.
11. **Lineage has four near-copies**: `find`, `findEdges`, `findVertices`, `bodyOf` (match a reference to the pieces and aliases of ids). One matcher.
12. **Three failure channels** (`RefLost`, `Refusal`, a plain error) mapped to a status in `engine.compute`: fine as it is; not worth touching.

## Not worth merging
`region.ts` (pure, one purpose), `params.ts`, `document.ts`, `exchange.ts`, `clean.ts` / `cleanup.ts`, `hole.ts`: small, single purpose, no overlap. `kernel.ts` (443 lines) is the only file that touches OCCT by rule (`inv_kernel_boundary`); it is long but it is the adapter, and splitting it by topic (mesh and exchange; rounds and regions) is optional.

## Order I would do them in
7, then 2, 3, 5, 6, 9 (small, safe, make the stress test faster and the checks shorter), then 1 and 4 (the real reductions), then 8, 10, 11.
