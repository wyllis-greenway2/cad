---
id: dec_exchange_gaps
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1019, in_1020
date: 2026-11-19
depends_on:
  - dec_import_export_more: the same Import and Export dialogs, the same formats list; this adds rows and options to them
  - dec_import: STEP and SVG import are changed (STEP stored packed; SVG use)
  - dec_export_formats: STEP export is changed (no colour, named products, a schema)
  - dec_import_mesh: mesh limits and repair, below
alternative_to:
---
# Exchange gaps: STEP done properly, BREP and FreeCAD, drop and detect, SVG use, bigger imports

`in_1019` asked for the gaps in import, export and compatibility and `in_1020` took the AI's list except the 1:1 PDF (a drawing view and its PDF are to be built on their own). **Built:**

- **A bug found and fixed: every STEP export carried the colour red.** The kernel library's helper (`exportSTEP` in replicad) sets a colour on each shape (red when none is given) and always writes AP242. A part exported from the app opened red in other programs. `compiler/kernel/occt/stepout.mjs` is that writer without the colour and with the schema as a choice.
- **STEP export:** with several bodies each body is a **named product** (the body's name) of one assembly; one body is named for itself; **no colour**. A **STEP version** choice in the dialog (remembered): **AP214** (the default: nearly every program reads it), **AP203** (the oldest, for old CAM and CAD) or **AP242**; the file's schema line is checked in the tests. Colours and names a person gives a body wait for those to exist in the app (see `dec_export_more`).
- **BREP both ways** (`BRepToolsWrapper` in the kernel, `import` step with `format: "brep"`): OpenCASCADE's own text format, exact, no unit (millimetres, or the unit typed at import); one row in Export and `.brep` / `.brp` in Import. Round trips an exact body (the volume of a post equals the exact one, not a mesh's).
- **FreeCAD `.FCStd` import** (`compiler/fcstd.ts`): a zip of `Document.xml`, `GuiDocument.xml` and `.brp` shapes (layout from the FreeCAD wiki, `docs/sources/README.md`); the **finished shapes** come in as bodies (the ones shown, or with no `GuiDocument.xml` the ones no other object is made from), the recipe, sketches and constraints are not read, and the message says how many of how many. **Checked against a layout built to the wiki's description, not against a file FreeCAD wrote** (none was available): the human is asked to try a real one.
- **Drop a file on the page** (`main.ts`): it imports, one after the other, each with its own options dialog; **a file is read as what is in it** (`interaction/sniff.ts`: STEP, STL (ASCII, and binary even when its header begins with "solid"), 3MF, OBJ, BREP, FCStd, SVG, DXF (text and binary) by their contents), also for the file chosen by the dialog, so `part.dat` with an STL in it is `part.stl`. Checked in a real browser (Chromium: a `.dat` dropped on the page opened "Import STL" for `mystery.stl`).
- **STEP and BREP text kept packed in the project** (`compiler/kernel/occt/pack.mjs`, `fflate`, MIT, now a direct dependency: `docs/licenses.md`): deflate and base64, about a fifth of the size (a 12.8 MB STEP of 5,120 faces: 2.7 MB); a project saved before it, with the text as it was, still builds. The limit is **100 MB** of file text (was 25): measured, the faceted 5,120-face body reads in 4.2 s per 12.8 MB, so the largest files take minutes; the browser's autosave (a few MB) will not hold a project with a big import: the Save button does.
- **SVG:** `<use>` (also of a `<symbol>`'s content, with x, y and the use's own transform, to a depth of 8 and 2,000 followed), `display:none` and `visibility:hidden` (as an attribute or in a style) now leave out the element **and what is in it** (a hidden group's children were drawn before). Checked against `cairosvg`'s drawing of the same file (the filled shapes' extents and positions). **Text is still left out and said**: turning text into outlines needs a font, which is a dependency and a licence decision that belongs with a text tool; stroke widths and colours are not read (a stroke is a centre line).

**Not built here:** the 1:1 PDF (a drawing view first, by the human's word); colours and names in STEP (the app has none for a body); SVG text.

## Rationale

Every item removes a way a file fails to come in or goes out wrong: a STEP that opened red, a file the app refused for being large or misnamed, a FreeCAD document with no way in. BREP is nearly free from the kernel and is what FreeCAD itself keeps.
