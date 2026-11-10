---
id: dec_export_stl
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_255
date: 2026-11-10
depends_on:
  - inv_kernel_boundary: the mesh for export is made by the kernel, so it crosses the kernel interface as plain data like everything else; a change to that rule changes where export is made
  - dec_platform_web_portable: saving a file goes through the platform's file service, which today offers only text; export needs it to save bytes
---
# Export the body as an STL file for printing (draft, for the human to answer)

**Status: a draft written at the human's request (`in_255`); nothing here is built or approved.** Rule 3 of `CLAUDE.md`: it stays `provisional` until the human answers the questions at the end.

## What

The human's blueprint (`docs/origin/CAD_Blueprint.original.md`) lists "Export STL or 3MF for slicing and printing" as a need, "full quality, no restrictions, all tiers" as the first thing the 3D printing community wants, and 3MF and STEP after it. The app has no export of any kind today, so a body modelled in it cannot leave it. This entry proposes the smallest thing that fixes that: **a menu item "Export STL…" (in the ⋯ menu, with save and open) that saves the current body as a binary STL file in millimetres.** 3MF and STEP come after, as separate entries.

## How (the proposal)

1. **The kernel makes the mesh.** The kernel interface gets one more call, `exportMesh(graph, quality)`, returning plain data (vertices and triangles, no kernel objects). It meshes the final solid of the graph at the export quality. The screen's own mesh is not used for the file: it is made coarse on purpose (a deflection of 0.2 % of the part's size, `evaluate.mjs`) so it is quick to draw and to drag, and a 100 mm part would have facets of 0.2 mm on its curves.
2. **Quality** (blueprint: "full quality"): a chordal deflection of **0.01 mm** and an angular deflection of **0.1 rad** (about 6 degrees), whichever gives more triangles. The kernel cannot make a mesh finer than the model allows, so a part that is very large or very small is limited by the kernel's own tolerance. (A quality choice, a "draft / fine / very fine" setting, is not proposed for the first version: one good quality.)
3. **The file.** Binary STL: 80 byte header (a text line with the app's name and the project's name), a count, then for each triangle its normal and three corners as 32 bit floats and a 2 byte attribute of zero. About 50 bytes a triangle: a body of 100,000 triangles is 5 MB. Units are millimetres, as modelled, and **Z is up as modelled** (printers and slicers use Z up). The model is not moved or turned for export: where it stands in the world is where it is in the file (the slicer places it on the bed).
4. **What is exported:** the final body of the model as it is now (the picture at the history's cursor, not a later one). Hidden sketches, planes, constraints and the like are not exported. With **no body, the item is greyed out** with the reason ("nothing to export yet: make a body").
5. **The platform.** `FileService` gets `saveBytes(name, bytes, type)` next to `save(name, text)`; the web version is a download, as now. The suggested name is the project's name with `.stl` (or `model.stl` for an unsaved one).
6. **Checks before the file is made:** the kernel's own validity check of the solid (already made after every operation), and the export says when the mesh has an open edge (it should not: a valid solid is closed). The result line shows the triangle count and the size in mm so the human can see what was made.

## Tests it would come with

The same graph exported at the two qualities has more triangles at the finer one; a box is 12 triangles and its mesh volume (from the triangles) equals the kernel's volume to 1e-6; a cylinder's deviation from the true circle is under the deflection asked for; the bytes of the file are 84 + 50 x triangles long and read back to the same triangles; a model with no body says so and makes no file; the export of a moved and turned body is where the body is. The kernel interface's conformance test gets the new call.

## Alternatives considered

- **Write the STL from the mesh already on screen.** Smallest (no kernel call, instant). Rejected for the file because it is coarse, and a coarse STL is the "clean STL export" the blueprint says the free tiers fail to give. It is the right source for a quick "preview the print" and could be offered as such later.
- **3MF first.** Better for modern slicers (units, colour, one file) and in the blueprint. It is a zip of XML: more to write, and the same mesh. STL first because every slicer reads it, then 3MF from the same mesh.
- **STEP first.** For manufacturing handoff (the blueprint's secondary user); OpenCASCADE writes it natively. Later: it is not what a printer needs.
- **Export a mesh made in the browser's main thread.** Rejected: the kernel is on its own thread so the page does not freeze (`in_132`); a fine mesh of a big body takes seconds.

## Questions for the human

1. **Quality:** is 0.01 mm / 0.1 rad the right default, or would you want a setting? (Finer is slower and makes bigger files; most printers resolve 0.05 to 0.1 mm.)
2. **Orientation:** keep the model where it is in the world (proposed), or turn it so its largest flat face lies on the bed?
3. **The menu:** "Export STL…" in the ⋯ menu next to save and open (proposed), or in the right-click ring too?
4. **Which next:** 3MF or STEP after STL?
5. **More than one body** (when it comes): one file with all bodies, or one file each?
6. **Does it ask for a name** (the browser's save dialog) or just download `<project>.stl` (proposed)?

## Rationale

The product's reason to exist is a body that prints (`prin_function_over_form`): without a file a slicer can read, nothing modelled here can be made, so export is the shortest path from "works in a test" to "used". It is proposed as the first piece of the blueprint's import and export section because it is small (one kernel call, one writer, one menu item) and unblocks real use; the rest of the section builds on the same mesh and the same file service.
