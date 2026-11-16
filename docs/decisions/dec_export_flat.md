---
id: dec_export_flat
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_522, in_525, in_563, in_564
date: 2026-11-16
depends_on:
  - dec_export_formats: the same file service (`saveBytes`) and the same menu rows; this adds the two flat formats (SVG, DXF) that `dec_import_export_menu` point 3 puts after STEP
alternative_to:
---
# Export a flat drawing as SVG or DXF

`in_525` asked for SVG and DXF export next, from the order proposed in `dec_import_export_menu`. **Built as the AI proposed, narrowly:**

- **What is exported:** a *selected flat face of the body* (its outline: the outer edge and the holes), else the *lines, arcs and circles of what is selected* of a sketch (a figure with the figures inside it, lines, circles, a drawn plane), else, with nothing selected, *the whole drawing* when it lies on one plane. Drawings on several planes without a selection, a face with a sketch, and a whole body are refused with what to select.
- **Coordinates:** the plane's own, x along its first direction and y along its second, millimetres, as drawn (nothing is moved to the origin).
- **SVG** (`compiler/flatfile.ts` `svgText`): the file's width and height are in mm (so laser and vinyl programs size it right), a 1 mm margin, no fill, a 0.1 mm black line; the pieces that meet end to end are one path (closed with Z when they come round, so a cut is one closed shape), a circle is a `<circle>`; y is turned over so the picture is the same way up; arcs keep their radius (an `A` command).
- **DXF** (`dxfText`): the old plain form (AC1009) that every program reads, units mm ($INSUNITS 4), a LINE, ARC or CIRCLE for each piece (an arc is always counter-clockwise in DXF, so a clockwise one is written from its other end); the programs join the pieces themselves.
- **Menu:** `Export sketch as SVG…` and `Export sketch as DXF…`, greyed out with the reason when there is nothing to export (`appmenu.ts`).

**Checked outside the tests (`ezdxf` and `svgpathtools`):** a block's top with a round hole gives a DXF and an SVG whose total lengths are both 145.1327 mm (the rectangle and the hole) and `ezdxf`'s audit finds no errors; a half circle gives 31.4159 mm both ways.

**Layers (`in_563`, groundwork of `dec_manufacturing_prep`):** a drawn line or circle can be marked **Cut, Score or Engrave** (the ring's *Layer* category; `use` on the part, command `setUse`, one step to undo; cut is the usual and is stored as nothing; a figure selected marks its lines and the holes in it). A file made from a drawing with anything marked carries layers: the SVG has one group for each (`id` and Inkscape layer name `cut`, `score`, `engrave`, in the usual colours red, blue and black), the DXF a layer table (`CUT` colour 1, `SCORE` 5, `ENGRAVE` 7, linetype CONTINUOUS) with each entity on its layer; what is not marked is cut; pieces that meet are joined only within a layer; a drawing with nothing marked exports exactly as before. **On the screen (`in_564`):** a line marked *score* is drawn as blue dashes and one marked *engrave* as a thicker orange line (`settings.theme.markScore`, `markEngrave`); cut, the usual, stays the thin charcoal line, so a drawing with nothing marked looks as before. The lists of lines are made by `interaction/linepairs.ts` (pure), the colours in `ui/view/content.ts`. Layers are not read back by the importer yet. Faces of a body export as before (no layers).\n\n**Not built:** colours and line weights beyond the layer colours; text and dimensions; ellipses and splines (the app has none); a choice of what to export beyond the selection; units other than mm; DXF in a newer version with polylines; several sketches in one file.

## Rationale

Laser, vinyl and CNC users need the outline, not the solid; the sketch and the face outline already exist in the app in plane coordinates (`offsetbody.ts` for faces), so the cost is the two writers. The old DXF form is chosen for reach over neatness: every program reads it, and joining lines into shapes is what they all do on opening.
