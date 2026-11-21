---
id: dec_engine_design
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1463, in_1465, in_1472, in_1476
date: 2026-11-21
depends_on:
  - dec_scope_real_cad: the engine is built on an exact model because the product is real CAD
  - dec_kernel_hybrid: the kernel stays OCCT behind the adapter; the design asks nothing else of the kernel than its operation history
  - inv_kernel_boundary: only the adapter touches kernel objects, and the engine's ids and lineage are plain data
  - prin_history_additive: the recipe is additive; editing an earlier step is deliberate and the later ones follow
alternative_to:
---
# The engine's design (proposed from six spikes; not yet reviewed by the human)

The recipe is a graph of steps and the truth; each step's run returns the exact body and what every face and edge became (lineage, from the kernel's own report completed by exact rules); the interface works on one derived list of vertices, edges and faces with lasting ids, the same for what was drawn and what was made; a line drawn on a face is imprinted into the body as a step; a failed step is flagged and passes its input through and the model is never lost; an edit recomputes only what depends on it and stops where an answer is unchanged. The rows are in `docs/rebuild/engine_requirements.md` (E1 to E23); the evidence is the six prototypes under `prototypes/` (`lineage-occt`, `mesh-fillet`, `replay-graph`, `line-engine`, `real-models`, `lineage-curved`).

This entry stays `provisional` until the human has read the requirements and approved them, or said what to change. It does not supersede `dec_stable_references` or `dec_stable_reference_mechanism` (names by how a thing was made, with geometry as the fallback): it would replace the fallback by an offer the person confirms, and the matching by the kernel's own history; the human has not said so.

## Rationale

The old app's failures came from how it kept the model (positional names, rounding patches, a blank model on one failed step, a history that cost the square of its length, a hidden sketch beside the body's edges). The spikes show each can be avoided by this design on the cases tried, and show what cannot: the kernel failing on a valid shape, about one fair edit in forty on the human's own models, which the design contains and does not prevent.
