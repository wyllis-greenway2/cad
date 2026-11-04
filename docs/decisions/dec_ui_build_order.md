---
id: dec_ui_build_order
kind: decision
status: accepted
origin: human
human_input: in_015
date: 2026-11-04
---
# Build the interface in stages: planes, then sketching, then extruding

The interface is built in this order: (1) the 3D view with planes and navigation, (2) sketching on a
plane, (3) extruding on the plane. Earlier prototypes (`kernel-slice`, `sketch-extrude`) stay as reference;
parts are reused where they fit, and the rest is discarded.

## Rationale
The human asked to "nail down the interface" first and to do these steps in this order (`in_015`). Each
stage can be tried by hand before the next one is built on top of it, which matters because the first
sketch prototype passed scripted tests while still confusing its first real user (`in_014`).
