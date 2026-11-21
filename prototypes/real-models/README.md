# real-models (THROWAWAY prototype)

Spike 5 of the engine thinking (`in_1463` to `in_1475`). Decides nothing by itself; never import this code from production code (CLAUDE.md rule 9).
Runs the old app's saved models (`app/test/fixtures/*.cad.json`, the human's own) as real recipes through the old app's compiler and OCCT interpreter.

**Meant to learn:** on real parts, (A) what the dependency structure of a recipe really looks like, and (B) how often a random edit of a number makes a step fail, and why. This is the test of the engine design against the old prototype's own failures. It did NOT run the new engine (lineage, graph, containment) on these models: every operation type of the old interpreter would have to be rewritten with history capture first. It measures what the new design is up against.

## Run
`./runall.sh` (each model in its own process, four at a time; output under the scratchpad), `node run.ts <budget ms> <edits> <fixture>`, `node one.ts <fixture>`.
A first run in one process was thrown away: the old kernel's memory is not freed between evaluations (3.3 GB of its 4 GB used after a few dozen models) and every later model failed with "the model is too big for the kernel's memory".

## What it learned
78 of the 95 models give kernel operations (16 are sketch-only or gear features computed outside the kernel graph, and 1 did not open: **the gear models, the heaviest real parts, are not covered**). Two of the 78 already fail unedited (`deleted-body-ghost`, `hole-edits`); the other 76 were edited, 12 random edits each (a number scaled by 0.5 to 1.5, or one sketch corner moved up to 10% of the figure's size): **911 edits**.

**(A) Real recipes are short chains.** 692 operations in 78 recipes: median 7 operations, longest 33, median depth 5, deepest 27; most recipes are one body's chain with a few extra roots. Replaying after an edit at a random operation: flat 7.5 operations, graph 5.7 (24% fewer); the six recipes of 20 or more operations: 13.9 against 11.4 (18% fewer). **The graph's large wins in spike 3 came from many independent bodies; real models are mostly a single chain, where it helps little.** (They are also short: at 5 to 30 ms an operation, replay cost is not a problem at these sizes.)

**(B) Random edits.** 841 of 911 edits (92.3%) made the model fine; **70 (7.7%) made an operation fail**, and **18 (2.0%) left the model blank** (the old interpreter skips every step that needs a failed one). 32 of the 76 models had at least one failing edit. By the kind of operation edited: sketch 39 of 312, revolve 4 of 10, transform 10 of 135, extrude 10 of 307, face push 4 of 33, edge fillet or chamfer 3 of 114.

Why the 70 failed:

| share | cause | what the new design does about it |
|---|---|---|
| 34% (24) | **a reference lost** (face, line or round face "not found", "the model changed since this step was made") | the lineage ids target exactly this (spikes 1 and 4: 0 wrong references in 684 checks, but on boxes, cylinders and flat faces; **not shown for revolve, loft, shell or curved faces, which are among the failing steps here**) |
| 20% (14) | **the edit asked for something impossible** (a cut that takes all the body, a push through the body, a fillet bigger than the face, a turn that lies on itself) | nothing to fix: refuse and say why, keep the rest |
| 20% (14) | **OCCT returned an invalid solid** | contained (flagged, the model shown, later steps run), not prevented |
| 10% (7) | my random edit made the sketch cross itself (a test artifact) | none |
| 7% (5), 6% (4), 2% (2) | OCCT could not sew pieces into one body; could not make a loft or shell; others | contained, not prevented |

Of the failures that were fair requests (70 less the 21 impossible or self-crossing = 49): **49% were references lost, 51% were OCCT failing on a valid shape**. In edits: references lost 2.6% (24 of 911), OCCT failing 2.7% (25 of 911).

**What this says about the design.** The lineage design can plausibly remove about half the failures and containment turns the 2% blank models into a flagged, visible model (the failing step's input passes through). The other half is OCCT failing on valid shapes at about 1 edit in 40; the design contains it and does not prevent it. That is the same conclusion as the earlier spikes, now with a rate measured on real models.

## Cautions
- The edits are crude: scaling by 0.5 to 1.5 includes many that no person would make; 21 of the 70 failures are requests that cannot be met. Use the proportions, not the 7.7%, as the figure.
- 12 edits for each of 76 models, one run, one seed; no confidence interval.
- The failing steps include loft, revolve and shell, which the lineage spikes never touched; "lineage removes the reference failures" is an expectation, not a result.
- The old kernel's memory growth across evaluations is a finding in itself (the old app restarts the kernel thread): the new engine needs shapes released or a worker that restarts.
