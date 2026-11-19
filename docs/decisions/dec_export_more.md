---
id: dec_export_more
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1016, in_1017
date: 2026-11-19
depends_on:
  - dec_export_formats: the 3MF writer gains objects; the same fine mesh and the same choice of bodies
  - dec_export_flat: the DXF writer gains joined paths; the same pieces and layers
  - dec_import_export_menu: one new check in the Export dialog (DXF only); the remembered options keep it
alternative_to:
---
# 3MF with an object for each body; DXF with the outlines joined into paths

`in_1016` asked which file types next; the AI listed five and `in_1017` chose the first two: **a 3MF with names and an object for each body**, and **a DXF with a choice of version**. **Two things found while building changed the second and limited the first** (both said to the human in the reply):

- **3MF** (`threeMfObjects` in `compiler/threemf.ts`, `exportObjects3mf` in `interaction/exportfile.ts`): with more than one body in the file (everything, or the selected ones), the 3MF has **one object for each body, named for it** (the body's own name, as the app has it: `s_013`), all built where they stand, so a slicer lists them apart and each can be moved, set up or left out of the print alone. One body is one object with no name, as before. **Colours are not written, and names are the bodies' ids**: the app has no body colours and no names a person gives a body yet; both are a feature of the app (a body can be coloured and named), not of the file, and a 3MF that writes them waits for that. Checked outside the tests: `trimesh` reads the file of a block and a post as a scene of two objects, each watertight, volumes 16000 and 9420.9 mm3 (the post's true 9424.8: the mesh).
- **DXF** (`dxfText(…, joined)`): **the export was already the old R12 form (AC1009) that every program reads**, so a choice of version would add nothing; what laser and CNC programs gain is **joined paths**. The new check **Outlines: joined into one path each** (on by default in the dialog; the file functions default to off, so a caller that does not ask gets what it got) writes the pieces that meet end to end as one `POLYLINE` (VERTEX lines, a bulge for an arc, a closed flag), each layer's runs joined on their own; a run of one piece and circles are written as before. It stays R12 on purpose: the R13 and later forms need handles and subclass markers that cannot be checked against the programs that are strict about them. Checked outside the tests: `ezdxf` audits the file with no errors, reads the polyline closed with its 8 vertices and its bulges, and the length of its flattened path is 111.42 mm against the true 111.416. Read back by the app's own import the arcs are arcs again.

**Not built:** colours and given names (above), a DXF of R2000 or later (above), joined paths in SVG (it already writes paths).

## Rationale

A slicer lists the objects of a 3MF and lets each be placed, so one object for a plate of parts is a step back from the files the slicers' own programs write; the cost is one mesh for each body instead of one. A cutter lifts and drops at each end of a separate line; one path per outline is what the programs expect of a drawing made for cutting, and R12 polylines are the form every one of them reads.
