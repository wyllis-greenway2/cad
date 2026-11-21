---
id: q_scope_real_cad
kind: question
status: open
origin: ai-unreviewed
human_input: in_1472
date: 2026-11-21
depends_on:
  - dec_scope_real_cad: this asks what else the widening changes
alternative_to:
---
# What else changes when the product is real CAD, not printing CAD?

`dec_scope_real_cad` widens the product. Not decided, for the human:
- **Target user and price:** the blueprint aims at the serious independent creator in the 3D printing community at about 5 to 10 dollars a month. Does that stay, or is the user wider (engineers, makers who machine, small shops)?
- **Features that real CAD expects and the prototype did not have:** assemblies with exact mates, 2D drawings, sheet metal, surfaces, configurations, units and tolerances, STEP with colours and assembly structure. Which come first?
- **The kernel:** `dec_kernel_hybrid` says OCCT now and our own later on evidence; real CAD raises the stakes on OCCT's failures (spikes in `prototypes/lineage-occt`, `mesh-fillet`, `replay-graph`).

## Rationale

The scope changed and the entries that mention printing as the aim (`dec_export_stl`, `dec_clearance_defaults`) were written under the old scope; the human should say what holds.
