---
id: dec_no_sketch_isolation
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_084
date: 2026-11-05
depends_on:
  - dec_stable_references: a constraint to a corner of the body has to find that corner again when the body changes
  - prin_graph_is_truth: one graph of steps, sketches and constraints, not a sketch mode with its own world
---
# No sketch isolation: everything is clickable and constrainable at any time

The human's model (`in_084`): there is no mode that isolates one sketch. The scene is sets of lines, planes and objects. Any of them can be clicked at any time, and constraints can be set on any of them at any time, including between a sketch and the body: for example draw a square, extrude a cube, draw a small square on the cube's face, select one corner of the new square and one corner of the cube, and make them coincident.

AI's proposed way to build it, in stages (not approved yet):
1. **No mode.** Sketch lines, corners and circles of every sketch are hoverable and selectable in the 3D view at all times (done in part in `in_083`); a selection can mix sketches and body parts (shift-click); the pill, menu and constraint offers work from whatever is selected. Leaving "sketch" would only mean that drawing tools are armed.
2. **Constraints to the body.** A body corner (or line) picked together with a sketch corner becomes an *external anchor* for that sketch: its 3D position, projected onto the sketch's plane, is a fixed point in the sketch's own 2D solve. "Coincident" with a body corner then pins the sketch corner there; distances, horizontal and vertical to a body corner work the same way. The anchor is remembered by its construction name where there is one, and by position otherwise (`dec_stable_references`), and is refused if it would depend on something built after the sketch (a cycle).
3. **Constraints between two sketches** on different planes: only through their projected points at first, no full 3D solve.

Risks: external references can break when the body changes (they need the stable-reference work); the 2D solver in `src/solver` stays per sketch, so true 3D constraints are not part of this.

## Rationale

It is the human's stated direction, and it removes the mode confusion that the single-click, tool and N changes have been circling. The staged plan keeps the solver and the kernel boundary as they are and adds only a new kind of fixed point.
