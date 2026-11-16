---
id: dec_manufacturing_prep
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_548, in_551
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: preparation is the Prepare and Check stages, and a split is a derivation step in the graph
  - prin_graph_is_truth: anything that makes new bodies is a graph step linked to its source
  - dec_standing_mates: split pieces sit assembled by mates at the cut faces
alternative_to:
---
# Preparing a part for manufacture, with or without an output file

**AI proposal from `in_548`; not approved; nothing built.** The human likes a route that prepares a part even when it never writes a cut or print file, for example splitting a print with keys and allowances.

1. **The line between graph and plan:** whatever makes **new bodies** is a graph step (split, connectors, moulds); whatever depends on a **machine choice** is in the plan (compensation, tabs, order, tool, orientation).
2. **Splitting a part that does not fit the bed.** A finding compares the part with the machine's bed and offers split planes at sensible places (small cross-section, flat cut face, pieces that lie flat); the user can also place planes by hand with the plane tools. Each cut gets a **connector**: pin and socket, square key, dovetail, bolt hole with nut pocket, or a plain glue face. The connector's **clearance** comes from the printer's tolerance in the machine profile (for printing this is the "allowance"; kerf is the laser's word). The pieces are bodies linked to the source, regenerate when it changes, and are mated at the cut faces.
3. **Fit compensation** at export: a small offset on round faces from the printer's tolerance (holes print small, shafts large), applied when the file is written; the model stays nominal. The kernel already has an operation that changes the radius of a round face.
4. **Also:** heat-set insert pockets from a size table; orientation advice with overhang and bridge findings.
5. **Cutting routes** (beam, milling): detect operations from the solid's features (through and blind holes, flat-floored pockets, outline) or from a drawing's closed figures (inner figures are holes, cut inside first); every detection is a suggestion the user can change. Stages: v1 beam outline cutting (profile with tabs and kerf, layers, SVG or DXF, GRBL laser G-code, preview); v2 milling from solids (drill and pocket, a small tool library, default feeds); v3 nesting several parts, flipping for a second setup, V-carve and raster engraving.

## Rationale

Splitting and clearance are work only a CAD program is placed to do, they need no slicer and no G-code, and they run on the kernel we have (`in_548`). Separating graph from plan by "makes bodies" versus "depends on a machine" keeps the model's history free of machine choices while keeping derived parts linked to their source.
