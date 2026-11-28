# Files the human sent: fixtures and whole-history invariants

Status: **built from `in_1740`** (the human asked for fixtures and invariants after two files showed bugs: a sketch line picked through a body, a fillet that vanished when a body was added). Each file the human sends is kept in `test/fixtures/` and every invariant below is run on every file; a bug that a file showed is made a row here with the file as its proof. The brief for the invariants is `handoff.md` 1508.

How to read a row: as in `world_view_requirements.md` (Inputs, Contracts, Test kind `unit` / `browser` / `hand` / `later`, Status). These rows are about files and the engine, not about inputs.

## Contracts of this section
- `Engine` (`src/engine/engine.ts`): a recipe of steps, run; each result has a status and a fingerprint.
- `Steps` (`src/engine/steps.ts`): the step kinds and whether each makes a body or a sketch.
- `ExtrudeSteps` (`src/interaction/extrude.ts`): the steps the page adds for a figure extruded (what joins a new body to the model).
- `Fixtures` (`test/fixtures/model_8.cad`): the files (this one and its neighbours in `test/fixtures/`) the human sent, as they were sent.

## Inputs this section claims
- none: these rows are about files and the engine

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| F1 | **Every file the human sent opens and builds**: no step of it fails, but the steps the engine itself flags and says why (`model_10.cad`: two pushes that left nothing); a flagged step is not an orphaned one. | in_1740 in_1745 | | `Engine`, `Fixtures` | unit | built |
| F2 | **No step takes a body that a newer step has replaced**: a step whose input X has a body step made from X before it (a round, a push, a move) that it does not itself take is a mistake (a combine of the extrude and a new body that leaves out the round of the extrude). The files the page makes have none; `model_9.cad`, made before the fix, has exactly one (its `c1`), and `model_10.cad` four (its moves `m2` to `m5`, each made on `t1` while the picture was of an earlier move: the part seemed not to move), which the check must find. | in_1739 in_1740 in_1745 | | `Engine`, `Steps`, `Fixtures` | unit | built |
| F3 | **A body added to a model is joined to the model as it is now, and the engine says which step that is** (`Engine.current`: the last step of the recipe whose result is a body and that is not orphaned; the page does not guess it from the kinds of steps): for every file, `current` is the last step that makes a body and the combine `extrudeSteps` adds takes it first; with no body there is no combine. | in_1739 in_1740 in_1741 | | `Engine`, `ExtrudeSteps`, `Steps`, `Fixtures` | unit | built |
| F4 | **A move or a turn keeps the volume of the body** (to a millionth), at every such step of every file. | in_1740 | | `Engine`, `Fixtures` | unit | built |
| F5 | **The same recipe gives the same result**: built twice, every step has the same fingerprint. | in_1740 | | `Engine`, `Fixtures` | unit | built |
