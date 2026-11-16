---
id: dec_import_export_menu
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_522, in_523, in_524, in_525, in_526, in_527, in_528
date: 2026-11-16
depends_on:
  - dec_export_formats: Export… writes 3MF and STEP as well as STL
  - dec_export_flat: Export… writes SVG and DXF
  - dec_import: Import… reads STEP, SVG and DXF
  - dec_import_mesh: Import… reads STL and 3MF
alternative_to:
---
# One Import… and one Export…, with standard options; an about block in the project file

`in_522` asked whether the share-state data should be in the save file, whether Save / Open / Export STL should become Import and Export, and which formats first; the AI's answer (the order of formats, the options, the menu) was written as an open question, and `in_524` to `in_528` approved and built it step by step. This is that plan as it now stands, built (`in_528`).

- **Formats, in the order built:** export STL, 3MF, STEP, SVG, DXF; import STEP, SVG, DXF, STL, 3MF. `in_523` showed the kernel reads and writes STEP; IGES and glTF are not in the kernel build and are left out, with OBJ and the closed formats (SLDPRT, F3D, DWG).
- **The menu:** Save and Open stay the app's own project (the recipe, with history and undo); **Import…** and **Export…** are one row each (the separate rows for each format and for the selected body are gone). **Export…** is greyed out with the reason when there is nothing to export.
- **Export… asks (`interaction/transfer.ts` describes it, `ui/dialog.ts` draws it, `main.ts` `exportDialogFlow`):** the *format* (a format with nothing to export is greyed out with the reason); *what* (everything, or only the selected bodies; a sketch or a flat face is the selection for SVG and DXF, else the whole drawing); *units* (millimetres or inches: the numbers of every format, and the unit the file declares: the STL's header, the 3MF's `unit`, the STEP's length unit, the SVG's width and height, the DXF's `$INSUNITS`); the *quality* of a mesh (fine 0.01 mm, medium 0.05, coarse 0.2); *a file for each body* (when there are several, in one zip); the *file name*. The last format, units, quality and per-body choices are remembered between visits.
- **Import… asks (after the file is chosen):** the *units* the numbers are in (STL: millimetres, centimetres, inches or metres; 3MF, SVG and DXF: as the file says, or one of those); a further *scale*; *where* (as in the file, its middle at the origin, or for a body standing on the XY plane, centred); for a drawing, *which plane* (the selected one, else XY; or XY, XZ, YZ). STEP, which says its own units, is asked the scale and the place (done by the kernel inside the one step). Nothing is remembered: each file is asked afresh.
- **The about block:** every project file starts with `"about": {"app", "build", "saved"}` (the app, the build of it that wrote the file, the time): a project sent with a bug report says what made it; opening a project says `opened a project saved by CAD build … on <date>`. Files saved before it open as they did (no block). The full diagnostic snapshot (recent actions, device, timing) stays its own command, **Share state**: it is large, changes on every action and carries details of the person's device that should not travel in files they share.
- **Checked in a browser (Chromium, scripted):** the menu rows; the Export dialog with STEP in inches (the file's unit and size), a typed name, a zip of three 3MF files for three bodies (valid zip, valid 3MF), the remembered format and quality, Escape cancelling with no download; the Import dialog through the real file chooser (an STL scaled by 2 and stood on the floor: volume ×8, z from 0); Save and Open with the about block.
- **Found on the way (fixed):** the kernel's STEP unit is one setting for the whole kernel that stays as it was left, so one export in inches made every later one inches (the unit is now set every time, millimetres too); the dialog crashed when opened with no file name given; Escape did nothing when the focus was not inside the dialog.

**Not built from the original plan:** *place at the middle of the view* (the origin or the floor instead), *repair* as a choice (flipped triangles are always turned, a mesh with holes is refused with what to do; no hole filling), *import as a sketch or a body* as a choice (a drawing is a sketch, the rest are bodies), colours and names in any format, a dialog in the right-click ring.

## Rationale

Save and Open keep the history; Import and Export are for other programs' files, which gain or lose information, so they are separate rows and the dialog says what each does. The options are the standard ones a person expects of the formats (units, quality, one file or many); the dialog is a description drawn by a thin page, so what each asks is tested without a browser and only the drawing needed one.
