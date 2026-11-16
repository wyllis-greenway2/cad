---
id: q_import_export
kind: question
status: open
origin: ai-unreviewed
human_input: in_488
date: 2026-11-16
depends_on:
alternative_to:
---
# One Import and one Export, and which formats first

`in_488` asks whether the "share state" data (`snapshotOf`: the last intents, viewport, device, build, timing; today a separate file for a bug report) should be part of the save file, and whether Save, Open and Export STL should become **Import** and **Export** with standard options. **Today:** Save and Open write and read the project (`cad-project` JSON: base scene, commands, cursor, `operation/file.ts`); Export STL (`dec_export_stl`) writes a mesh; Share state writes a separate diagnostic file. **Nothing is built; the AI's proposal, for the human to decide:**

1. **Share state.** *Recommended: keep it separate, but put a small `about` block in every project file* (app build, file version, date) so a project sent for a bug report already says what made it. The full diagnostic snapshot (recent intents, device, user agent, timing) stays its own command: it is large, changes on every action, would make every save differ and every file bigger, and carries device and browser details that should not travel in files people share with others. Alternative: an *Include diagnostics* checkbox in Export that adds the snapshot.
2. **Menu.** *Recommended: keep Save and Open as the app's own project* (a quick, lossless, undoable round trip: the recipe, not a result) *and add Import… and Export… beside them*, not instead: Import and Export are for other programs' files, which lose or gain information (a STEP has no history), and a person needs to know which one keeps their history. Export STL becomes an Export with a format choice; "Export the selected body" becomes its *Only the selected body* option.
3. **Formats, in order.** Export: **STL** (done), **3MF** (the slicers' modern format: units, colours, several bodies; the blueprint asks for it; a zip of XML, written in plain code), **STEP** (the exchange format between CAD programs and makers' shops: exact surfaces, not triangles; the kernel (OpenCascade through replicad) can write it), then **SVG** and **DXF** of a sketch or a flat face (laser, vinyl and CNC users; 2D, small to build). Import: **STEP** first (bring in a part someone else made: arrives as a body with no history, which can be pushed and pulled, cut, filleted and mated but is not a recipe), then **STL and 3MF** as bodies (a mesh body: can be measured, mated, cut with and exported again, but its faces are triangles, so no fillet or face edit on it), then **SVG and DXF** as sketches (a logo or a laser cut outline to extrude). OBJ, glTF, IGES and the closed formats (SLDPRT, F3D) are left out: OBJ and glTF are for rendering, IGES is old, and the closed ones cannot be read honestly.
4. **Standard options.** Export: *what* (everything, the selected bodies, a sketch), *units* (mm default, inch), *quality* for meshes (a tolerance in mm, default fine), and *one file or a file per body*. Import: *units* (the file's own when it says, else mm), *where* (at the origin, or at the middle of the view), *as* (a body, or a sketch for 2D) and *repair* (sew an STL's open gaps, or say it is not closed).
5. **Order of work.** (a) the `about` block and the menu with Import / Export beside Save / Open (STL only at first); (b) 3MF export; (c) STEP export and import; (d) SVG / DXF; (e) STL / 3MF import as mesh bodies, which needs a body kind the app does not have yet and should be its own decision.

## Rationale

The blueprint names STL and 3MF as the first need of makers and STEP as the exchange format of CAD users; the project file is the only format that keeps the history, so it must stay distinct from files that cannot. Production code needs an accepted entry (`CLAUDE.md` rule 9); this stays open until the human chooses.
