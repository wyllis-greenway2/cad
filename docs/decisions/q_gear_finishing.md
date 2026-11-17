---
id: q_gear_finishing
kind: question
status: open
origin: ai-unreviewed
human_input: in_755
date: 2026-11-17
depends_on:
  - dec_gear_tool: the tooth outline is drawn as lines and arcs (4 arcs to a flank by default) and a helical body is a twist of it; a change to that changes each option here
  - dec_worm_gears: the wheel is a loft of five sections of the worm's cut; the straight-land option changes that
  - dec_gear_feature: a gear body keeps eight parts, so extra tooth faces cost the kernel and the mesh, not the page's parts
alternative_to:
---
# Gear finishing: worm wheel lands, tooth chamfer, a spline flank, a helical rack

**Asked (`in_755`):** are our worm wheels made as real ones are, should the top and bottom of the teeth be chamfered and what would it cost, would a richer curve for the tooth flank be more exact or quicker than 4 arcs, and why can a helical gear not mesh with a rack. Nothing is built for these; this records what was found (from the code and general gear knowledge, **not measured** here) and what to decide.

**Worm wheel.** A real wheel is a helical-toothed blank with a **throat**: its rim is hollowed by a circle about the worm's axis (radius the worm's outside radius plus clearance) so it wraps the worm; the blank has a straight cylindrical **land** at each face (the face width is limited, about 0.75 of the worm's tip diameter, and the corners are often broken), cut by a hob that is the worm. The human's picture (a straight sided helical gear with the curved seat cut from it) is how it is made. Ours (`wheelsections.ts`, `worm.ts`) is the whole of what the worm leaves of the blank, to the throat arc, with a width up to 1.26 times the throat: the tooth ends where the throat arc meets the face, so the end of a tooth is a thin wedge. Option: a **land** of a chosen width (default about one module) at each face: the outline is the sections already worked out, with the first and last section repeated out to the faces (a straight loft piece), so the tooth keeps its section to the face; no new maths, five sections become seven. Not tried; needs the check that the wheel still meshes (kernel intersection with the worm, as the tests do).

**Tooth chamfer.** Chamfering every tooth edge at both faces is hundreds of edge operations (about 20 edges a tooth, a fillet or chamfer each) and the kernel is slow and fragile on that; do not do it edge by edge. Cheaper and how machinists do it: **one cut with a revolved profile** (the blank's envelope with a 45 degree cone at each end, a chamfer of c modules), which breaks every tooth tip at once. It adds about one conical face a tooth at each end; with `dec_gear_feature` those are not parts, so the page does not slow down; the kernel adds one boolean. Printing note: a 0.2 to 0.4 mm chamfer on the bottom face also helps the first layer; this is the human's call. To measure before deciding: a prototype with the 40 tooth gear, time with and without.

**A richer curve for the flank.** Now: 4 arcs a side by default (2 to 8, `detail`), about 20 parts a tooth. One **B-spline per flank** (an interpolating curve through about 8 points of the involute) would be exact to about 0.001 mm and cut a body to about 4 faces a tooth (2 flanks, tip, root) instead of 10 or so; the spline tool exists (`dec_spline_and_cams`). Not clear it is faster: B-spline faces are slower than cylinders in the kernel's boolean and offset operations, arcs are exact analytic cylinders and print the same. A prototype (spur gear 40 teeth: kernel time, faces, volume against the exact area) would decide; it is cheap, and under `prototypes/`.

**A helical rack, and a rack with a helix field.** `meshWith` refuses a helical gear against a rack ("a helical gear does not mesh with a rack yet") and `canHelix` excludes racks, so the rack has no Helix field. A helical rack is the rack's section (transverse module mn / cos(helix), the same trapezoid) **sheared** along the rack as it is extruded: each layer slid sideways by height x tan(helix). The body is an oblique extrusion (the kernel's prism along a slanted vector) rather than the twist used for a gear, so it needs a step that takes a direction not along the normal, then Helix on the rack (opposite hand to the gear it meshes with), and the mesh placement shifted by the shear. Medium work; not started.

**Questions for the human:** (1) build the wheel land (width default)? (2) a chamfer of tooth tips by one revolved cut, as a field of the gear? (3) a spline flank prototype first? (4) the helical rack and the Helix field on a rack?

## Rationale

The record keeps these as open questions because each is a choice of shape or cost the human has not decided, and none was measured.
