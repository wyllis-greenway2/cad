---
id: dec_delete_surface
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_285
date: 2026-11-12
depends_on:
  - dec_sketch_belongs_to_step: a surface that a step uses belongs to the body made from it, so it is not deleted on its own
alternative_to:
---
# Deleting a whole surface of a sketch

The human asked (`in_285`) for a surface of a sketch to be deletable, and proposed the rule: **delete the surface's own edges, keep the edges it shares with other surfaces, and nothing else**; only sketch surfaces (a body must stay valid). Built as that, provisional until tried:

- A surface is a cell of the drawing (`pieces`: the part of a figure that crossing curves cut out). Its edges are pieces of lines, arcs and circles. An edge **no other surface has** is the surface's own; the others are shared.
- **Delete takes each own edge off its line or circle exactly as the trim tool does** (the part between the places where other curves cross it): a circle whose outer arc is deleted is left as the arc that runs through the circles over it; a rectangle cut in two by a line, with one half deleted, loses its three own sides and keeps the line and the other half as a closed surface. Edges that other surfaces share, and every curve that is not the surface's, stay. Undo is one step.
- **Refused, with the reason shown:** a surface that a step uses (a body is made from it; take the step out first), a surface every edge of which is shared (nothing of it is its own: the middle of three overlapping circles), several surfaces at once or a surface with other things selected (one at a time, so the result is clear).
- A surface that is a whole figure on its own (one circle, one rectangle, no crossing) keeps the older rule: the figure and its points go.

Is the rule always true? It is well defined for every cell: own edges are the edges nothing else borders, and trimming them removes nothing that another surface needs, so no other surface is ever broken (a neighbour's boundary is made only of edges it shares). What can surprise: a curve that crossed the deleted surface and carries on beyond it keeps its parts outside; and a surface whose own edge cannot be trimmed (nothing crosses it) is refused rather than guessed.

## Rationale

Needed because only whole figures could be deleted, and a surface cut out of overlapping circles had no delete at all. The human's rule is the same operation the trim tool already does per edge, so one mechanism does both (`operation/trim.ts`: `deleteSurface`).
