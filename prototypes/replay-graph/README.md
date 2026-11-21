# replay-graph (THROWAWAY prototype)

Spike 3 of the engine thinking (`in_1463` to `in_1472`). Decides nothing by itself; never import this code from production code (CLAUDE.md rule 9).
Uses spike 1's OCCT loader (`../lineage-occt`, with its `node_modules` symlink) and spike 2's Manifold wrapper (`../mesh-fillet`).

**Meant to learn:** what an edit costs when the recipe is replayed as (flat) a list from the edit onward, (graph) only the steps that depend on the edited one, or (cutoff) the same but stopping where a step's output did not change; and what a single long chain of features does to that, on both kernels.

## Run
`node bench.mjs mesh|occt 10x10,20x15,40x25 <drag edits>`, `node longchain.mjs mesh|occt 50,100,200,400`.

## What is here
- `engine.mjs`: the three replay modes; each step is `{id, kind, params, inputs}`; a step that throws is flagged and passes its first input through; results are shared by pass-through and freed when the last holder lets go. `makeRecipe(bodies, per)`: bodies interleaved as a person would build them (box, then hole, boss, fillet in turn), joined in groups of four.
- `kernels.mjs`: the same five step kinds on Manifold and on OCCT (validity checked after every OCCT step).
- `bench.mjs`, `longchain.mjs`, `smoke.mjs`.

## What it learned
**Many bodies (the graph's case).** Editing the first step of body 0 (one body's chain, plus its joins), then the last step of the last body, the middle step of the middle body, a no-op change, and a drag of the middle step:

| kernel, size | flat, first step | graph, first step | flat, a drag edit | graph, a drag edit | cutoff, no-op change |
|---|---|---|---|---|---|
| mesh, 107 steps | 107 steps, 0.45 s | 13 steps, 0.07 s | 52 steps, 0.39 s | 8 steps, 0.11 s | 1 step, 1 ms |
| mesh, 315 steps | 315 steps, 1.6 s | 18 steps, 0.17 s | 165 steps, 1.0 s | 10 steps, 0.07 s | 1 step, 0 ms |
| mesh, 1030 steps | 1030 steps, 6.3 s | 28 steps, 0.34 s | 530 steps, 4.6 s | 16 steps, 0.22 s | 1 step, 0 ms |
| OCCT, 107 steps | 107 steps, 1.2 s | 13 steps, 0.21 s | 52 steps, 0.87 s | 8 steps, 0.40 s | 1 step, 2 ms |
| OCCT, 315 steps | 315 steps, 5.5 s | 18 steps, 0.70 s | 165 steps, 4.3 s | 10 steps, 0.47 s | 1 step, 2 ms |

The graph recomputes 10 to 40 times fewer steps and takes 6 to 20 times less time; a change that does not alter the answer costs nothing with cutoff. Failure stayed contained throughout: 160 steps of 1030 were flagged on the mesh kernel (the recipe fillets the same four edges again, which the second time no longer exist) and 11 to 41 on OCCT, every model stayed valid, and later steps ran.

**One body, one long chain (the graph cannot help).** Each step needs the one before.

| steps | mesh: build, replay after editing step 1 | per step, first 10 / last 10 | OCCT: build, replay after editing step 1 | per step, first 10 / last 10 |
|---|---|---|---|---|
| 50 | 0.21 s, 0.16 s | 1.4 / 6.0 ms | 1.0 s, 1.0 s | 6.7 / 42 ms |
| 100 | 0.62 s, 0.53 s | 1.5 / 8.1 ms | 4.3 s, 4.2 s | 6.7 / 90 ms |
| 200 | 1.95 s, 2.5 s | 2.3 / 18 ms | 16.4 s for one build (`occt200.mjs`: 8.2 s booleans, 8.2 s validity checks); the 4-replay harness did not finish in 550 s | 85 ms at step 190 |
| 400 | 6.0 s, 5.4 s | 1.1 / 27 ms | not run | |

A step costs more as the body grows (about 25 times at 400 steps on the mesh kernel), so a replay grows faster than the number of steps. Editing the last step is cheap (6 to 24 ms mesh, 16 to 103 ms OCCT). OCCT per step cost 3 to 5 times the mesh's. **A 200-feature chain on OCCT takes 16.4 s to build once** (`node occt200.mjs 200`: 8.2 s in the booleans, 8.2 s in the validity checks, the faces going from 28 to 470): both parts grow about as the square of the steps. The harness run that printed no 200-step row replays the chain four times and fingerprints each step by counting faces, which explores the whole shape; that was the harness, not a limit of OCCT. The validity check is half the time and can be spent less often (every few steps, or only before a step is trusted by the next).

## Cautions
- The recipe is synthetic (boxes, cylinders and bosses on plates); a real model has sketches, patterns and imports. The graph here is chains plus joins.
- Manifold evaluates booleans lazily: the work appears when the answer is first asked for. The totals are right; the first version of the per step timing was not (fixed in `longchain.mjs`).
- The memory figures in `bench.mjs` (`rss`) are not trustworthy: the first mode in each process also pays the heap's initial growth, and the WebAssembly heap never shrinks. OCCT's process reached 4 GB at 1030 steps and I stopped that run (no 1030 step OCCT row).
- No cache eviction was tried; a real engine will need one, and a result's memory cost was not measured separately.
