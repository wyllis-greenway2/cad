---
id: dec_no_sketch_isolation
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_084, in_085, in_086
date: 2026-11-05
depends_on:
  - dec_stable_references: a constraint to a corner of the body has to find that corner again when the body changes
  - prin_graph_is_truth: one graph of steps, sketches and constraints, not a sketch mode with its own world
---
# No sketch isolation: everything is clickable and constrainable at any time

The human's model (`in_084`): there is no mode that isolates one sketch. The scene is sets of lines, planes and objects. Any of them can be clicked at any time, and constraints can be set on any of them at any time, including between a sketch and the body: for example draw a square, extrude a cube, draw a small square on the cube's face, select one corner of the new square and one corner of the cube, and make them coincident.

The way to build it, in stages (the human said "yes, start with stage 1", `in_085`; stage 1 is built, stages 2 and 3 are confirmed one at a time as they are reached):
1. **No mode.** Sketch lines, corners and circles of every sketch are hoverable and selectable in the 3D view at all times (`in_083`, `in_085`: done, except mixing a sketch part and a body part in one selection, which comes with stage 2 because it is only useful for constraints to the body); a selection can mix sketches and body parts (shift-click); the pill, menu and constraint offers work from whatever is selected. Leaving "sketch" would only mean that drawing tools are armed.
2. **Constraints to the body.** A body corner (or line) picked together with a sketch corner becomes an *external anchor* for that sketch: its 3D position, projected onto the sketch's plane, is a fixed point in the sketch's own 2D solve. "Coincident" with a body corner then pins the sketch corner there; distances, horizontal and vertical to a body corner work the same way. The anchor is remembered by its construction name where there is one, and by position otherwise (`dec_stable_references`), and is refused if it would depend on something built after the sketch (a cycle).
3. **Constraints between two sketches** on different planes: only through their projected points at first, no full 3D solve.

Risks: external references can break when the body changes (they need the stable-reference work); the 2D solver in `src/solver` stays per sketch, so true 3D constraints are not part of this.

## Rationale

It is the human's stated direction, and it removes the mode confusion that the single-click, tool and N changes have been circling. The staged plan keeps the solver and the kernel boundary as they are and adds only a new kind of fixed point.

## Stage 1 as built (`in_085`)
With the select tool, nothing is isolated any more: hovering and clicking work on every sketch's lines, corners and circles, on faces, planes, body corners and lines, whatever sketch is being edited. Clicking another sketch's part makes that sketch the one being edited with the part picked; clicking a face, plane, body corner or line leaves the edited sketch and selects it. Only the drawing tools still belong to one plane (the surface you start on). Not done: picking a sketch part together with a body part (stage 2).

## Stage 2 as built (`in_086`, "yes, start stage 2")
While a sketch is being edited, **Shift + click a corner of the body** adds it to the selection next to the picked sketch parts (it shows as the selected corner; Esc lets go of it first). With one sketch corner and one body corner selected, the menu offers **Coincident with the body corner**: the sketch corner is pinned to where the body corner lands on the sketch's plane (a constraint of kind `anchor`, which the solver treats as a fixed point; the other constraints of the sketch keep working, so a rectangle stretches to reach it). The pin remembers the body corner's 3D position and is re-found (the nearest body corner within `sketch.anchorTolMm`) whenever the body is rebuilt, so it follows the body (`SketchStore.refreshAnchors`, not an undo step); if the corner is gone the pin is marked lost and stops acting (the ownership map lists it as broken). Asking for the same pin again releases it; pinning to another body corner replaces it. Only loose sketches follow the body: a sketch that has become a step keeps where it was pinned (following would make the step depend on the body it builds). Not yet: pins to lines (edges) of the body, distance and horizontal or vertical constraints to a body corner, a richer display of what a body corner is pinned to (the status line shows a count when the corner is selected outside a sketch), repairing a lost pin.
