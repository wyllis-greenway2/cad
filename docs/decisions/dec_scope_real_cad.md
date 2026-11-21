---
id: dec_scope_real_cad
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1472, in_1473
date: 2026-11-21
depends_on:
  - prin_manufacture_agnostic: the modeler already knows nothing of how a part is made; widening the scope from 3D printing to real CAD follows from it
alternative_to:
---
# The product is a real CAD modeler; 3D printing is one of the things it makes

The human said the software is not 3D printing software but is supposed to be real CAD software (`in_1472`) and asked for the vision to be updated (`in_1473`). What follows from that for how the model is held:

1. **The exact geometry is the model.** A body is an exact boundary representation (planes, cylinders, cones, spheres, tori, splines), not a mesh. A mesh is only a derived picture of it: for the screen, for drag previews, for analysis (volume, wall thickness, interference) and for STL and 3MF export.
2. **It talks to other CAD programs.** STEP (and IGES) are read and written as exact geometry; an imported body is a body with no recipe, with ids given to its faces and edges at the import.
3. **Printing is a manufacturing route like the others** (`prin_manufacture_agnostic`): a module on top of a finished model, not a reason for the model's shape.
4. **What this entry does not change.** The blueprint (`docs/origin/CAD_Blueprint.original.md`) is the human's text and stays untouched; its market (the serious independent creator, price, positioning) is not decided here. Whether the target user, price and first features should change with the scope is for the human to say (`q_scope_real_cad`).

## Rationale

The human's statement (`in_1472`). It decides the engine: an exact B-rep truth cannot be a mesh, so the mesh route of the engine spikes (`prototypes/mesh-fillet`) is a proxy and analysis tool only, and the engine design is built on an exact kernel (OCCT behind the kernel adapter, `dec_kernel_hybrid`, `inv_kernel_boundary`).
