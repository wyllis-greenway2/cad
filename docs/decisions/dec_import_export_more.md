---
id: dec_import_export_more
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_988, in_989, in_990
date: 2026-11-19
depends_on:
  - dec_import_export_menu: the new formats are rows of the same Export… and Import… dialogs with the same units, quality and file-name choices
  - dec_import_mesh: an OBJ comes in through the same cleaning and the same limits as an STL
  - dec_import: a binary DXF is turned into the ASCII text the DXF reader already reads
  - dec_export_formats: an OBJ is written from the same fine mesh as the STL and 3MF
alternative_to:
---
# More formats for compatibility: OBJ both ways, binary DXF in; IGES waits for a kernel build

`in_988` asked which formats to add; the AI proposed OBJ and binary DXF, then DXF blocks and layers, then IGES; `in_989` asked for IGES to be written as well as read (for older systems); `in_990` asked for all of it, details left to the AI.

**Built (OBJ and binary DXF):**

- **OBJ export** (`compiler/obj.ts`, row `OBJ` in the Export dialog): text, one object, the fine mesh of the STL and 3MF (same quality choices and units), **Z up as modelled** and corners at the same place written once (the kernel's mesh has its own corners for each face: a block is 8 points, not 24). The first line says the units and the axis, because an OBJ says neither. Checked outside the tests: `trimesh` reads the file of a 30 mm post as watertight, volume 9420.9 mm3 against the true 9424.8 (the mesh).
- **OBJ import** (`parseObj` in `compiler/meshfile.ts`, then the STL path of `dec_import_mesh`): `v` and `f`, corner numbers from 1 or back from the last point, `v/vt/vn` forms (texture and normal ignored), faces of more than three corners cut into triangles from the first corner (right for flat convex faces; a concave one is cut wrongly), lines, points, groups, materials and curved surfaces left out and said. No units in the file, so the Import dialog asks as it does for an STL (millimetres by default). Checked outside the tests: `trimesh` wrote the fixtures (`test/fixtures/trimesh-box.obj`, `trimesh-cylinder.obj`) and the volumes come in as its (1000 and 2996.587 mm3).
- **Binary DXF import** (`binaryDxfText` in `compiler/flatparse.ts`): the file is turned into ASCII DXF text, which the one DXF reader then reads. R13 and later (two byte group codes) and R12 (one byte, 255 for a big code) are told apart by `$ACADVER`; strings are UTF-8 from 2007 on and Latin-1 before; a file cut short says so. Checked outside the tests: `ezdxf` (an independent reader) reads the encoder's file and gives the same entities as the ASCII twin; its first reading of the AI's first encoder failed (the R13 codes were one byte there), which is how the two byte codes were found.

**Not built here, and why:**

- **IGES (both ways).** The kernel build (`replicad-opencascadejs`) has the IGES code inside it but does not expose the reader or writer classes, so IGES needs a rebuilt kernel (OpenCASCADE compiled to WASM with those classes bound). That build needs a toolchain and sources downloaded that the session's environment refused, so **it is waiting for the human to say how to proceed** (a person builds the kernel on their machine, or the environment is allowed the downloads). Once the build exists, import and export are the same plumbing as STEP; there is no reason to leave export out (`in_989`).
- **DXF blocks, inserts and layers** (the next step): not yet built.

## Rationale

OBJ is the one mesh format the app lacked that most mesh tools read, and it costs one writer and one reader on the mesh path that already exists. Binary DXF is a gap in a format the app already claims. Welding the corners on export makes the OBJ a proper mesh in the programs that read it, not a triangle soup of 24 corners per block.
