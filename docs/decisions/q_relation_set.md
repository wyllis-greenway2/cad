---
id: q_relation_set
kind: question
status: open
origin: ai-unreviewed
human_input: in_1642
date: 2026-11-26
depends_on:
  - dec_relations_standard: it is the table of relations this audit reads, and it already groups some of what the engine keeps apart
alternative_to:
---
# Which relations are really different? (the audit the human asked for, `in_1642`)

Read from `engine/solver.ts` `RELATIONS` (23 kinds) by what each one says as equations. Nothing is changed; the human has not approved any of it. (Not the same as `q_constraint_audit`, which is about refusals.)

## Exact duplicates (the same rows as something else)
| kind | is the same as | how |
|---|---|---|
| **in line** (`collinear`, line, line) | two **on the line** | its two rows are exactly: each end of the second line is on the first. "A line on a line" = two vertices on a line; "one end on the line + parallel" is the same fact. |
| **concentric** (circle, circle) | **coincident** of the two centres | the rows are the same two (x and y of the centres) |
| **length** (a line) | **distance** of its two ends | the same row |
| **level / upright** (a line) | **level / upright** of its two ends | already one relation with two ways of naming the parts; and each is **distance across / up and down equal to 0** |

## The same idea, different curve (one relation with the kind of curve as a detail)
| kinds | the idea |
|---|---|
| **on the line**, **on the circle** (and **in line**) | a point lies on a curve: one row, its distance from the curve is 0. Only the formula for "distance from the curve" differs (a line's perpendicular, a circle's |centre - point| - r); an arc and later a spline would be the same kind again. `dec_relations_standard` already says "on (a corner on a line, on a circle, on a plane)". |
| **tangent** (line, circle), **circles touching** (circle, circle, outside or inside) | one curve touches another (distance to it equals the radius); the third case, two lines, is parallel |
| **equal length**, **equal radius** | two things have the same size (length of a line, radius of a circle; later an arc's length) |

## The same row with a number or without
**parallel** and **square** are **angle** with 0 and 90 degrees and no number kept (same `turned` row, a different period); **level / upright** are the angle to an axis. Worth keeping as names (they are what people reach for) but one engine.

## Not duplicates
coincident, midpoint (two rows: a point at the middle; it is not "on the line" plus anything shorter), fixed, symmetric (3 parts, not offered as a helper), distance, radius, distance to a line, across, up and down, angle.

## What it would come to
23 kinds could be about 12 the person meets: **coincident, on (line or circle), tangent, level/upright, parallel/square/angle, equal, midpoint, fixed, symmetric**, and the dimensions **distance (a length is one), radius, to a line, across, up and down**. **Cost:** every stored `kind` in saved files, and about a hundred lines in `src`, `test` and `dev` that name the kinds that would go (a count by name, not read one by one), the icons and labels (the person still sees "on the circle" vs "on the line" if the label follows the part: that is wording, not a second constraint), the helper offers (`kindTuples`: one kind with several part kinds is already how `horizontal` works), and a **migration** of old files. **Gain:** fewer offers that say the same thing twice (a line near another gets "in line" and two "on the line" today), less code in the solver and the standard, redundancy and conflict checks that see one fact once.

## To decide (not decided)
1. Which of the above to merge (the exact duplicates are safe; the curve and size groups are a naming and migration choice).
2. Whether the person should still see two names ("on the line", "on the circle") for one kind.
3. Whether the old kinds stay readable in saved files (migrated on load) for good.

## Rationale
The human's question (`in_1642`): are in-line, on-line and on-circle not the same thing. By their rows they are, or nearly.
