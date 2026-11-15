---
id: q_loft_sketches
kind: question
status: open
origin: ai-unreviewed
human_input: in_431
date: 2026-11-15
depends_on:
alternative_to:
---
# Loft through sketches, and sketches whose shapes differ

`in_431` asked whether a loft through sketches can be offered and how it should work when the shapes change in complexity along it. **Can be built for the simple case:** the kernel has `loftWith` (used already for variable fillets and revolve pieces): two or more closed sketches on planes, in the order the person picks them, joined smoothly (or ruled: straight between each pair, a switch). **Where it gets hard, and the AI's recommendation, for the human to choose:** (1) *same number of sides, same kind* (rectangle to rectangle, circle to circle, circle to ellipse): the kernel matches them by their start points; recommended: show the start point of each section as a dot on its sketch and let it be dragged round (and a reverse-direction switch), as the match is where a twist comes from; (2) *different numbers of sides* (a square to a circle, a triangle to a hexagon): recommended for the first version: **refuse with the reason and say what would make it work** ("the sketches must have the same number of parts: split the circle into four arcs") and offer a one-click "split to match" that cuts the shape with fewer edges at the points that best match the other; do not blend unequal outlines silently, as the result depends on a guess; (3) *a section with holes or several outlines*: outlines are matched by position (biggest to biggest, then by order), a hole that has no partner in the next section is refused for the same reason; (4) *a point at an end* (a cone, a dome): allowed as a section that is one vertex; (5) *guide curves, tangent ends, a closed (looped) loft*: not in the first version. **Where the person works:** the Extrude family: select two or more closed sketches (on planes anywhere, which may be different sizes and angles), choose Loft; one step with the sketches in order, undone as one. **Not built.**

## Rationale

The matching of outlines is the whole difficulty: showing the start points and refusing unequal counts keeps every result something the person can see and control, and the simple loft is built on what the kernel already does.
