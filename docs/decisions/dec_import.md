---
id: dec_import
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_522, in_523, in_526
date: 2026-11-16
depends_on:
  - dec_export_formats: STEP is read by the same kernel build that writes it (`in_523`); the file service gains `pick`
  - dec_export_flat: SVG and DXF are read back into the same flat pieces the export writes, so a file the app wrote comes back as it was
  - dec_sketch_on_face_follows_body: a drawing imported onto a face of a body goes on a drawn plane that goes with the body, as a sketch drawn there does
alternative_to:
---
# Import: STEP as a body with no history, SVG and DXF as sketches

`in_526` asked for STEP and SVG / DXF import next, from the order proposed in `dec_import_export_menu`. **Built as the AI proposed, narrowly:**

- **Menu:** one row, `Import STEP, SVG or DXF…`, beside Save and Open (`appmenu.ts`); a file picker (`FileService.pick`) takes `.step .stp .svg .dxf`; the kind is the file's ending. One import is one step to undo.
- **STEP** (`importfile.ts`, the `import` step type, `graph.ts`, `readStep` in `interpreter.mjs`): the solids in the file become **bodies with no history**: the step keeps the file's text (`params.data`) and the kernel reads it on every build (millimetres: the kernel's reader converts the file's units), so the body can be pushed and pulled, cut, filleted, mated, moved, exported and saved like any body, but not edited as a recipe. Each solid is checked; a file with no solid in it (only surfaces or curves), a damaged file or an invalid solid is refused with the reason and nothing is changed. A second STEP stands beside the first as a body of its own. A file over 25 MB is refused (its text travels in the project and with every build).
- **SVG** (`compiler/flatparse.ts`, `parseSvg`): path (M L H V C S Q T A Z, relative too), line, polyline, polygon, rect (rounded too), circle and ellipse, with the transforms of the groups (`matrix`, `translate`, `scale`, `rotate`, `skew`); circles, circular arcs and rounded corners stay circles and arcs, also under a uniform scale, a turn or a flip; Béziers, ellipses and anything under an uneven scale are **flattened into short lines** (within about 0.01 mm), and the message says how many. Size: the width, height and viewBox when they are there (units mm, cm, in, pt, pc, px), else a user unit is a pixel (96 to the inch). The drawing's own origin stays the origin and y is turned up, so a file the app wrote comes back where it was. Text, images, `use` and anything in `defs` are left out and said.
- **DXF** (`parseDxf`): ASCII DXF: LINE, CIRCLE, ARC, LWPOLYLINE and POLYLINE (with bulges, as arcs), ELLIPSE and SPLINE (flattened; a spline with control points and knots to within about 0.01 mm, one with only fit points as a smooth curve through them, within about a millimetre of what other programs draw); `$INSUNITS` converted to millimetres; text, hatches and 3D entities are left out and said (blocks, inserts and layers came after: `dec_import_export_more`); a binary DXF is turned into ASCII text first and read the same way (`dec_import_export_more`).
- **Where a drawing goes** (`importPlane`): the selected plane, or the plane of a selected drawn figure, or a flat face of a body (as a drawn plane that goes with the body), else the XY plane of the world. The pieces that meet are joined at shared corners so closed outlines are figures that can be extruded; arcs are made about their centres, as arcs drawn in the app are.
- **Checked outside the tests:** `svgpathtools` gives the length of a path with lines, cubic, smooth, quadratic and rotated elliptical arcs as 481.984 mm, the import 481.948 (0.007 % less: lines instead of curves); `ezdxf` wrote the DXF fixture (`test/fixtures/ezdxf-sample.dxf`: lines, an arc, a circle, a bulged polyline, an ellipse, two splines, text) and its own curve of the control-point spline is within 0.006 mm of the import's.

**Not built here (STL and 3MF came with `dec_import_mesh`, `in_527`):** STEP names, colours and assemblies (an assembly's solids come in as separate bodies at their places), surfaces-only STEP, SVG text and styles (stroke widths, colours), choosing the plane or the place or the scale at import (the options of `dec_import_export_menu` point 4), a STEP in the browser larger than 25 MB.

## Rationale

The blueprint's second user needs a part someone else made, and laser and CNC users start from an SVG or DXF. The STEP is kept as text in the step (not as a separate asset) so a project stays one file and one history; the price is that the text travels with every build, which is why there is a size limit. A body with no history is the honest result of a file with none; the app's edits on faces and edges already work on bodies by their faces (`dec_face_edit_by_step`), which is what makes it useful.
