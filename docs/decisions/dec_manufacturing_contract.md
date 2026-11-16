---
id: dec_manufacturing_contract
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_543, in_544
date: 2026-11-16
depends_on:
  - inv_kernel_boundary: the contract hands modules mesh, STEP bytes and flat outlines (plain data), so a kernel swap changes nothing on the module side
  - prin_never_box_in: the point of the contract is that routes can be added, replaced or removed without surgery
  - prin_graph_is_truth: derivation routes (mould, cast pattern, unfold) must be graph steps so they stay linked to their source body
  - dec_export_formats: STL, 3MF and STEP are the first things a module may be given
  - dec_export_flat: SVG and DXF are the first flat outputs a 2D route may produce or be given
  - dec_platform_web_portable: every module runs as WASM or in a worker in the browser; no native helper programs
alternative_to:
---
# Manufacturing routes are modules behind a plain-data contract

**AI proposal from the brainstorm `in_543`; the human has not approved it. Nothing here is built.** The human asked to lay groundwork, not to build slicers now.

1. **Two kinds of route.** A *toolpath route* turns a part into machine instructions (FDM, CNC, laser, waterjet). A *derivation route* turns a part into new parts (mould cavity, sand mould, cast pattern with draft and shrink, sheet-metal flat pattern, stamping die). A derivation is a **step in the operation graph** (it regenerates when its source changes); a toolpath route is a **plan** kept in a separate `manufacturing` section of the project, referring to bodies by their stable ids and never stored inside the model graph. Routes chain: source body, derivation, toolpath route, machine.
2. **The contract** is a small versioned set of plain types in one place (no kernel or app objects, survives `structuredClone` as the kernel's result does). *In:* mesh (mm, Z up as modelled), optional STEP bytes, flat outlines in plane coordinates, body ids, material tags. *Out:* a toolpath (an ordered list of moves: travel, cut, extrude, power, feed, tool), preview geometry, files (bytes and a name), and a **parameter schema** from which the settings UI is generated.
3. **A route declares itself to a registry:** what it accepts, its parameter schema, the menu rows it adds, the preview it draws. Removing a route removes its rows and nothing else. The preview is drawn by one shared overlay in the existing camera and world (toolpath polylines with a layer or time scrubber); the renderer needs an overlay hook, and no route logic goes into the UI (`inv_no_logic_in_ui`).
4. **Profiles are layered data, not code:** *machine* (work envelope, kinematics, limits, heads or tools, G-code dialect), *material*, *process*; user presets inherit from vendor presets and override fields. The dialect is a template with named hooks (start, end, tool change, power on and off) and a raw custom-code escape hatch. One generic schema, versioned, so any machine can be described; popular machines are presets, not special cases.
5. **Shared, not duplicated:** 2D polygon offset and boolean (Clipper2, Boost licence), mesh slicing into contours, the toolpath move list and time estimate, the profile schema, the G-code writer, the preview overlay. **Per route:** the strategies (perimeters, infill and supports; pockets, profiles and drilling; kerf and tabs).
6. **Libraries:** permissive ones for geometry primitives (Clipper2; Manifold, Apache-2.0, for mesh boolean and repair), our own code for strategies and G-code. Slicer engines (CuraEngine, PrusaSlicer, Orca: AGPL) and potrace (GPL) are excluded by rule 10. Each licence is recorded in `docs/licenses.md` before use.
7. **Groundwork that is cheap and safe now (none done):** this contract and `inv_manufacturing_boundary`; the profile schema as types; a material tag on bodies; the reserved `manufacturing` project section; layers (cut, score, engrave) in SVG and DXF export, which `dec_export_flat` lists as not built.
8. **Suggested order:** groundwork; laser and 2D route with reference-image tracing; 2.5D CNC (holes and pockets are already in our graph); print-aware FDM preview then our own G-code; derivation routes.

## Rationale

The human wants modules that can be changed or replaced "without too much surgery and risk" and source models that can go down any number of routes (`in_543`). The kernel boundary already shows the method that works: one data format, one folder, a mechanical check. Using the same for manufacturing means a kernel change cannot break a slicer and a slicer cannot break the modeler. Putting derivations in the graph keeps a mould linked to the bust it came from; keeping toolpath plans outside the graph keeps machine choices from polluting the model's history. Layered profiles avoid both extremes: a fully generic machine model nobody can use, and hard-coded machines nobody can extend.
