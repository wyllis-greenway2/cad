---
id: dec_parts_library
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_688, in_689
date: 2026-11-17
depends_on:
  - prin_graph_is_truth: a library part is a step in the graph (a family and its numbers), so it stays editable and reproducible
  - prin_variable_over_hardcoded: a family and its dimension table are data; a new size or part is a row, not code
  - prin_never_box_in: a user can place a part we never heard of (their own model or a described one)
  - dec_manufacturing_definitions: the parts library reuses its three layers (project copy, personal library, official), the official-only start and the provenance rules
  - dec_body_mates: a library part carries mating points (axis, seating face) so mates attach without picking faces by hand
alternative_to:
---
# Parts library: families that generate parts, interface entries and stored models

**Drafted from `in_688`, not yet approved. Nothing built.** The human asked for a library of parts users add to a project, and whether to store every model or to hold key data and generate parts on demand.

1. **Generate where a standard exists.** A *family* (screw, nut, washer, bearing, pulley, standard profile) is a recipe: a generator plus a dimension table and the factors a user picks (for a screw: thread, diameter, length, head, seating). The part is built on the user's side through the same path as the gear tool and kept in the graph as the family and its numbers (changing the length later is changing a number). Storing every combination is not done: it is millions of files for what a few kilobytes of table and a generator give.
2. **Interface entries for the rest.** A part with no standard (a motor, a switch, a connector, a clip) is a small data entry: its envelope, mounting holes, shaft or connector position and the mating points, from which a simplified solid is generated. Most designs need only these, so most bought parts need no full model.
3. **Stored models last.** A fixed model (a STEP or a mesh) is fetched only when a user places it, with a light version for the viewport and the full one for export. Models a vendor offers for download are **linked, not copied**, unless the vendor's terms allow redistribution.
4. **Mating points on every part.** A family or entry says where its axis and seating faces are, so a placed screw mates to a hole without face picking; the same dimension table gives the fastener hole tool its clearance hole, nut trap and countersink.
5. **Layers and trust follow `dec_manufacturing_definitions`:** the project keeps a copy of every part it used (so an old project reproduces when the library changes); the user has a personal library; **only we make the official library at the start**, each family with a cited source for its table (the AI does not write dimensions from memory). A public layer for user-contributed entries is a later step (see `dec_parts_sourcing` and `q_parts_open_sources` for what it needs: a licence field, a verified or unverified mark, and entries as data wherever possible).
6. **Provenance on every entry:** author, date, version, licence, where its numbers came from, and a trust level (`official` or `user`), as for machines and materials.

## Rationale

A generated part is small, fast, editable and exact, and it fits the graph being the truth (`prin_graph_is_truth`). Interface entries cover the long tail of bought parts cheaply and are the geometry a designer actually uses. Reusing the three layers and the official-only start keeps one mechanism for every kind of shared data and keeps quality in our hands (`in_557` in `dec_manufacturing_definitions`).
