---
id: dec_loft_sketches
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_490, in_489, in_488, in_485, in_431, in_432
date: 2026-11-15
depends_on:
alternative_to:
---
# Loft through sketches, and sketches whose shapes differ

`in_431` asked whether a loft through sketches can be offered and how it should work when the shapes change in complexity along it. **Can be built for the simple case:** the kernel has `loftWith` (used already for variable fillets and revolve pieces): two or more closed sketches on planes, in the order the person picks them, joined smoothly (or ruled: straight between each pair, a switch). **Where it gets hard, and the AI's recommendation, for the human to choose:** (1) *same number of sides, same kind* (rectangle to rectangle, circle to circle, circle to ellipse): the kernel matches them by their start points; recommended: show the start point of each section as a dot on its sketch and let it be dragged round (and a reverse-direction switch), as the match is where a twist comes from; (2) *different numbers of sides* (a square to a circle, a triangle to a hexagon): recommended for the first version: **refuse with the reason and say what would make it work** ("the sketches must have the same number of parts: split the circle into four arcs") and offer a one-click "split to match" that cuts the shape with fewer edges at the points that best match the other; do not blend unequal outlines silently, as the result depends on a guess; (3) *a section with holes or several outlines*: outlines are matched by position (biggest to biggest, then by order), a hole that has no partner in the next section is refused for the same reason; (4) *a point at an end* (a cone, a dome): allowed as a section that is one vertex; (5) *guide curves, tangent ends, a closed (looped) loft*: not in the first version. **Where the person works:** the Extrude family: select two or more closed sketches (on planes anywhere, which may be different sizes and angles), choose Loft; one step with the sketches in order, undone as one. **Approved as recommended (`in_432`); building.

**Built (`in_432`):** *Loft* in the Shape menu with two or more closed sketches selected, on planes of their own, in the order picked (the first is the step's figure, the rest its `also` siblings, as an extrude carries them); chips: Smooth or Ruled, Split to match, and for each sketch with sides Start *k* (moves its start point, shown as an amber dot, to the next corner) and Reverse *k*; Enter or the check makes one `loft` step. Outlines are matched in `compiler/loftmatch.ts`: equal part counts join start to start; unequal are refused with the reason unless Split to match is on (a straight side cut in two at its middle, longest first; a circle becomes the same circle as that many arcs); holes are lofted and cut out and must be as many in every sketch; the step joins or cuts a body it meets as an extrusion does. **Not built:** a single point at an end (cone, dome), dragging the start dots (a chip moves them), dots for a sketch that was split, guides, tangent ends, a looped loft.

**Preview (`in_485`):** a loft's preview, open or waiting for the check (chosen before its sketches were clicked), is drawn as a wireframe, as the revolve's and the sweep's are (`frame.ts`).

**Number bubbles (`in_488`, `in_489`):** the human chose the start point of each sketch as the loft's number (not the distances between sketches). A bubble at each sketch's start dot (`loftEntries`) shows the corner it starts at, 1 to its number of sides; a number typed moves the start there (`loftStartTyped`, going round past the last), as pressing Start k does. A circle has none. The Start / Reverse chips stay.

**Distance bubbles (`in_490`):** on the line from each sketch's middle (the mean of its corners, a circle's centre) to the next, a bubble with the distance between them (`loftEntries`, `loftGapNumbers`); a number typed (field 10 + the gap, kept as text in `Op.loftGaps`) moves that sketch and every later one along that line, so the gaps after it stay. Nothing is made by typing: the preview shows the moved sketches, and Enter makes one command (the sketches moved by `transformFigure`, then the loft: one undo), `loftCommand` / `loftPlaced`. **Found and fixed:** the kernel's cache key for a loft held its sketches' names and not their places, so a loft whose sketches had moved (by this or by any edit) was answered with the old body; the key now includes them (`interpreter.mjs`, `loft.test.ts`).

## Rationale

The matching of outlines is the whole difficulty: showing the start points and refusing unequal counts keeps every result something the person can see and control, and the simple loft is built on what the kernel already does.
