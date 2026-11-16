---
id: dec_manufacturing_prep
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_548, in_551, in_553, in_554, in_560, in_572, in_603, in_561
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: preparation is the Prepare and Check stages, and a split is a derivation step in the graph
  - dec_manufacturing_version: the splitting, connectors and fit compensation are steps of a manufacturing version
  - dec_standing_mates: split pieces sit assembled by mates at the cut faces
alternative_to:
---
# Preparing a part for manufacture, with or without an output file

**Accepted by the human (`in_561`) as proposed by the AI from `in_548`, with `in_553`, `in_554` and `in_560`. Nothing built.** The human likes a route that prepares a part even when it never writes a cut or print file, for example splitting a print with keys and allowances.

1. **The line (`in_553`, `in_554`):** the geometry a part must have to be made by a process lives in a **manufacturing version** of the part (`dec_manufacturing_version`: split, connectors, shrink, draft, handles, fit compensation); what a machine does lives in the plan (tabs on a path, order, tool, feeds, orientation, kerf and tool compensation).
2. **Splitting a part that does not fit the bed.** A finding compares the part with the machine's bed and offers split planes at sensible places (small cross-section, flat cut face, pieces that lie flat); the user can also place planes by hand with the plane tools. Each cut gets a **connector**: pin and socket, square key, dovetail, bolt hole with nut pocket, or a plain glue face. The connector's **clearance** comes from the printer's tolerance in the machine profile (for printing this is the "allowance"; kerf is the laser's word). The pieces are bodies of the manufacturing version, regenerate when the design part changes, and are mated at the cut faces.
3. **Fit compensation** as a step of the manufacturing version (changed from an export-time offset by `in_553`): a small offset on round faces from the printer's tolerance (holes print small, shafts large), its value copied from the machine; the design part stays nominal. The kernel already has an operation that changes the radius of a round face.
4. **Also:** heat-set insert pockets from a size table; orientation advice with overhang and bridge findings.
5. **Cutting routes** (beam, milling): detect operations from the solid's features (through and blind holes, flat-floored pockets, outline) or from a drawing's closed figures (inner figures are holes, cut inside first); every detection is a suggestion the user can change. Stages: v1 beam outline cutting (profile with tabs and kerf, layers, SVG or DXF, GRBL laser G-code, preview); v2 milling from solids (drill and pocket, a small tool library, default feeds); v3 flipping for a second setup, V-carve and raster engraving. **Nesting (`in_560`, approved):** the first beam route (v1) gets **manual layout** (the user places parts on the sheet, with the sheet edge and spacing shown) and **bounding-box packing** (the program packs parts as rectangles); **true-shape nesting** (actual outlines, with rotation) comes later. **Built `in_572`:** manual layout (the sheet's edge in the preview and checks of overlap, spacing and the edge) and bounding-box packing with copies, in `dec_laser_outline_route`.

## Rationale

Splitting and clearance are work only a CAD program is placed to do, they need no slicer and no G-code, and they run on the kernel we have (`in_548`). Separating graph from plan by "makes bodies" versus "depends on a machine" keeps the model's history free of machine choices while keeping derived parts linked to their source.
