---
id: dec_sweep_modes
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_608, in_609
date: 2026-11-17
depends_on:
  - dec_sweep: the modes are two ways of placing the shape that dec_sweep carries along a path
alternative_to:
---
# A sweep can start from the sketch or along the line

A sweep has two placements of its shape, a step parameter `place`. **"From the sketch"** (`place` missing or `"sketch"`) carries the shape along the path from where it is drawn, as before. **"Along the line"** (`place: "path"`)
stands a copy of the shape with the **middle of its box** on the start of the path (the end nearer the shape's plane), square to the path there (an arc's tangent for an arc), and carries it along. The sketch itself is not
changed (it stays the recipe). A **new sweep starts "along the line"**; files made before keep "from the sketch". Two chips, "Along the line" and "From the sketch", switch the mode while the sweep is being made.
The choices "middle of its box" and "a new sweep starts along the line" were the AI's recommendations, approved in `in_609`.

## Rationale

The shape of a sweep drawn off to one side of its path, or not square to it, creases where the path's curvature changes (`in_606`). Standing the copy square on the path removes that and makes "sweep this shape along
that line" mean what it says; "from the sketch" is kept for the cases where the offset from the path is wanted, and for old files.
