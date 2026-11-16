---
id: dec_export_formats
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_488, in_489, in_490
date: 2026-11-16
depends_on:
  - dec_export_stl: the same body, the same bodies choice (all, or the selected ones, `in_271`) and the same file service; this adds two formats beside STL
  - inv_kernel_boundary: STEP is made by the kernel and crosses the interface as plain bytes; 3MF is written in plain code from the kernel's mesh
alternative_to:
---
# Export as 3MF and as STEP, beside STL

`in_490` asked for STEP and 3MF export first, from the order proposed in `q_import_export` (which stays open for the rest: the `about` block, an Import / Export menu, imports, SVG / DXF). **Built as the AI proposed, narrowly:**

- **3MF** (for slicers): the same fine mesh as the STL (`EXPORT_QUALITY`), written by `compiler/threemf.ts` as a zip (stored, no compression) of `[Content_Types].xml`, `_rels/.rels` and `3D/3dmodel.model` (one object, units millimetre, Z up as modelled, vertices joined where they coincide, the project's name as the title). One file for the bodies chosen, as for STL.
- **STEP** (for other CAD programs and shops): made by the kernel (`exportStep` in the kernel interface; replicad's `blobSTEP`, which `in_489` found works: a filleted block with a hole came back with the same faces and volume) from the exact solid, not a mesh, millimetres, as modelled; the bodies chosen as for the others.
- **Menu:** `Export 3MF…` and `Export STEP…` beside `Export STL…`, and the same two for the selected body when there is a choice (the ⋯ menu's rows: `appmenu.ts`).

**Not built:** colours, names and several objects in a 3MF; STEP names and colours; the options of `q_import_export` point 4 (units other than mm, quality, a file for each body); Import.

## Rationale

The blueprint lists 3MF and STEP after STL; `in_489` showed the kernel already has STEP, so the cost is the plumbing (the kernel's thread, the file) and a small zip writer. The menu keeps the rows flat for now: restructuring into one Export with a format choice waits for the human's answer to `q_import_export`.
