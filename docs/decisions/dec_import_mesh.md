---
id: dec_import_mesh
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_488, in_492, in_493
date: 2026-11-16
depends_on:
  - dec_import: the same Import row and file picker; this adds STL and 3MF to what it reads
  - dec_export_formats: a 3MF the app wrote (and an STL) comes back through this
alternative_to:
---
# Import STL and 3MF as bodies

`in_493` asked for STL and 3MF import as mesh bodies. `q_import_export` had said a mesh body "needs a body kind the app does not have yet and should be its own decision". **Decided by the AI while building, and to be looked at:** there is **no new body kind**. A closed mesh is turned into an ordinary exact body of the kernel whose faces are the mesh's triangles, the neighbouring triangles that lie in one plane joined into one face (`ShapeUpgrade_UnifySameDomain`); the app's whole machinery then works on it unchanged (move, turn, mate, cut and join, push and pull of its flat faces, measure, hard bodies, save and open, export as STL, 3MF and STEP). What it cannot do is what a faceted surface cannot: a curved part is many small flat faces, so it cannot be filleted or edited as a round face.

- **STL** (`compiler/meshfile.ts` `parseStl`): binary and text, in millimetres as written (an STL has no units).
- **3MF** (`parse3mf`, `unzip`): a zip (stored or deflated, read with the platform's `DecompressionStream`), the main model found through `_rels/.rels`, objects with meshes, **components** (also in other files of the package, `p:path`), **build items with transforms**, the model's **unit** (micron to metre) converted to millimetres; each object that is built is its own body (an assembly's parts come in separate at their places); objects that are not parts (support, surface) are left out and said; colours, materials and names are not read.
- **Made ready** (`weld`, `shellsOf`): corners at the same place (to 0.1 micron) are joined, triangles with no area dropped; a mesh that is **not closed** (open edges: holes in the surface) or has an edge of **more than two triangles** is refused with the counts and what to do (repair it in a mesh program); triangles that run the wrong way are **turned** to agree with their neighbours and a whole shell that is inside out is turned right way round, both said; **separate shells are separate bodies**.
- **Kept in the project** as the cleaned mesh (`importMesh` step: the points as floats and the triangles as numbers, base64, `compiler/kernel/occt/meshdata.mjs`), not the file; the kernel makes the solid when it builds (`solidOfMesh` in `interpreter.mjs`: a face for each triangle, sewn, made a solid, unified, checked), cached with the model like any step.
- **Limits, from measurement:** a mesh may have up to **12,000 triangles** (the build takes about a millisecond a triangle: 1,280 triangles 1.7 s, 5,120 triangles 5.5 s) and, once built with its flat areas joined, up to **6,000 faces** (the app lists and draws every face on each change: a fully curved body of 5,120 faces made each later step take about 3.5 s); over either it is refused with the reason (reduce it first in a mesh program). A boxy part with many triangles joins into few faces and is cheap.
- **Checked outside the tests:** `trimesh` (a separate library) wrote the STL and 3MF fixtures (`test/fixtures/trimesh-*`: a block, an icosphere, a 48-sided cylinder; the 3MF is deflated and uses name spaces); the import's volumes are 8000, 2072.087 and 1691.620 mm3, the same as `trimesh` reports for them.

**Not built:** a hollow mesh (a shell inside a shell: the inner shell comes in as a separate overlapping body, not a cavity); open meshes (no hole filling or repair); joining the curved triangles into smooth faces or fitting cylinders and spheres to them; STL units (always mm); 3MF colours, materials, names, slices, beam lattices; more than 12,000 triangles.

## Rationale

A new body kind would have meant the picture, the picking, the mates, the booleans, the export and the hard bodies each learning a second kind of body; an exact solid made of triangle faces gets all of them at once, at the price of limits on size that are written down and measured. The alternative of a real mesh body (triangles kept as a mesh, moved by a matrix, no kernel solid) stays open as a separate decision if bigger meshes matter more than editing them.
