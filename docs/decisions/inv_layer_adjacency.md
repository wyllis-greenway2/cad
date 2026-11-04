---
id: inv_layer_adjacency
kind: invariant
status: accepted
origin: human
human_input: in_001
date: 2026-11-04
depends_on:
  - prin_never_box_in: the layer boundaries are how the project keeps pieces swappable
---
# No imports across non-adjacent layers

Layers, top to bottom: UI, Interaction, Geometry Compiler, Operation Layer, Platform. Data flows down
through calls and events flow up through the event bus. If code wants to reach across a layer, an
interface method is missing: add the method, do not violate the boundary.

## Rationale
Human-authored: blueprint section 11 and "Three Non-Negotiable Rules" (rule 1). Violating it is a failed
code review. Should be enforced by a lint or import-boundary rule once code exists.
