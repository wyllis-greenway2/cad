---
id: dec_import_export_menu
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_522, in_523, in_524, in_525, in_526, in_527, in_528, in_1009
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

- **Formats, in the order built:** export STL, 3MF, STEP, SVG, DXF; import STEP, SVG, DXF, STL, 3MF. `in_523` showed the kernel reads and writes STEP; IGES is not in the kernel build (it needs a rebuild, `dec_import_export_more`) and glTF and the closed formats (SLDPRT, F3D, DWG) are left out; **OBJ both ways and binary DXF in came after** (`dec_import_export_more`).
- **The menu:** Save and Open stay the app's own project (the recipe, with history and undo); **Import…** and **Export…** are one row each (the separate rows for each format and for the selected body are gone). **Export…** is greyed out with the reason when there is nothing to export.
- **Export… asks (`interaction/transfer.ts` describes it, `ui/dialog.ts` draws it, `main.ts` `exportDialogFlow`):** the *format* (a format with nothing to export is greyed out with the reason); *what* (everything, or only the selected bodies; a sketch or a flat face is the selection for SVG and DXF, else the whole drawing); *units* (millimetres or inches: the numbers of every format, and the unit the file declares: the STL's header, the 3MF's `unit`, the STEP's length unit, the SVG's width and height, the DXF's `$INSUNITS`); the *quality* of a mesh (fine 0.01 mm, medium 0.05, coarse 0.2); *a file for each body* (when there are several, in one zip); the *file name*. The last format, units, quality and per-body choices are remembered between visits.
- **Import… asks (after the file is chosen):** the *units* the numbers are in (STL: millimetres, centimetres, inches or metres; 3MF, SVG and DXF: as the file says, or one of those); a further *scale*; *where* (as in the file, its middle at the origin, or for a body standing on the XY plane, centred); for a drawing, *which plane* (the selected one, else XY; or XY, XZ, YZ). STEP, which says its own units, is asked the scale and the place (done by the kernel inside the one step). Nothing is remembered: each file is asked afresh.
- **The about block:** every project file starts with `"about": {"app", "build", "saved"}` (the app, the build of it that wrote the file, the time): a project sent with a bug report says what made it; opening a project says `opened a project saved by CAD build … on <date>`. Files saved before it open as they did (no block). The full diagnostic snapshot (recent actions, device, timing) stays its own command, **Share state**: it is large, changes on every action and carries details of the person's device that should not travel in files they share.
- **Checked in a browser (Chromium, scripted):** the menu rows; the Export dialog with STEP in inches (the file's unit and size), a typed name, a zip of three 3MF files for three bodies (valid zip, valid 3MF), the remembered format and quality, Escape cancelling with no download; the Import dialog through the real file chooser (an STL scaled by 2 and stood on the floor: volume ×8, z from 0); Save and Open with the about block.
- **Found on the way (fixed):** the kernel's STEP unit is one setting for the whole kernel that stays as it was left, so one export in inches made every later one inches (the unit is now set every time, millimetres too); the dialog crashed when opened with no file name given; Escape did nothing when the focus was not inside the dialog.

**Not built from the original plan:** *place at the middle of the view* (the origin or the floor instead), *repair* as a choice (flipped triangles are always turned, a mesh with holes is refused with what to do; no hole filling), *import as a sketch or a body* as a choice (a drawing is a sketch, the rest are bodies), colours and names in any format, a dialog in the right-click ring.

## Rationale

Save and Open keep the history; Import and Export are for other programs' files, which gain or lose information, so they are separate rows and the dialog says what each does. The options are the standard ones a person expects of the formats (units, quality, one file or many); the dialog is a description drawn by a thin page, so what each asks is tested without a browser and only the drawing needed one.

## One way in and one way out, and Fabricate (`in_1083`)
The earlier rationale kept Save and Open apart from Import and Export. **The human changed that (`in_1083`):** the ⋯ list has **no Save, Open, Restore session or Share state**; **Import** and **Export** take every file in and out. **Export's first format is the Project** (`.json`, the model and its history; the default each time the dialog opens, asking only for a file name); it also carries, under `state`, **what the page knew when it was saved** (the view, the selection, what the kernel answered, the timing, the last things done: the whole of what *Share state* wrote), so **one file** is enough to send when something is to be looked into; opening a project ignores `state`. **Import** reads a project too (a `.json` file, or one whose text says `cad-project`), then the other programs' files as before. The keys Ctrl+S and Ctrl+O keep their places and open Export and Import. A copy of the last session is still kept in the browser (an auto-save is to come, and is to be opened like any file); there is no row to restore it. **Fabricate:** the ⋯ list has a **Fabricate** row that opens a list of its own (Laser cut, Laser layers, and the Laser table when there is one); **Material** and the **Fastener tool** are in the ring under **Shape, Fabricate** (the hammer), the material dimmed with "select a body first" until a body is selected. **Not changed:** *Reapply mates* (puts the mates that are no longer true back, one at a time), *Clear cache* (forgets the kernel's answers the page keeps between visits, `dec_description_cache`) and *Clearance* (the gap of the whole model, stepped through 0, 0.1, 0.2, 0.3, 0.5, 1 mm on each press, `in_473`) stay in the ⋯ list.
