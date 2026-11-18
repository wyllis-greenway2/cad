---
id: dec_path_repeat
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_808
date: 2026-11-18
depends_on:
  - dec_repeat_parameters: a path repeat is another kind of the repeat that keeps its numbers (a record in the scene, copies derived from it, named so a later step still finds them)
  - dec_sweep: its path (lines and arcs walked end to end) is the path this repeat follows, and its word "sweep" is already a solid operation, which decides the name
  - dec_stable_references: a path that is an edge or the outline of a face of a body must be found again when the body is edited
  - prin_graph_is_truth: the repeat is a record the model keeps, not a one-off drawing of copies
alternative_to:
---
# Path repeat (the "sweep pattern repeat"): copies of a figure, a body or a fastener placed along a line, an edge or the outline of a face

**Drafted from `in_808`, not yet approved. Nothing built.** The human asked for a repeat that follows a line or the edges of a face (by a distance, or equally divided, with an offset), to be built first and then used for fastener holes in a pattern (a distance from the edge, a spacing, work in from the corners, a fastener in the corner with the spacing adjusted, a number equally spaced). The AI's reading: it is all one machine, **a path, rules that turn it into places, and a consumer that does something at each place.**

1. **The path.** A chain of **lines and arcs** drawn on a plane (open, or closed: a rectangle, a circle), a **body's edge or a chain of its edges**, or the **outline of a flat face** (its edges joined as a closed path). Read from the parts each time (`dec_sweep`: the path follows an edit of what it is drawn in; an edge is found again by `dec_stable_references`). A path is walked from one end (an open one) or from a start corner (a closed one); which end or corner is the start can be chosen.
2. **The offset.** The path can be moved sideways by a **distance in its plane** (towards one side or the other; for a face's outline, into the face is positive): "the fasteners 10 mm in from the edge". An offset path of straight sides is the sides moved with their corners mitred; an arc keeps its centre and changes its radius; an offset that would turn a side inside out is refused with the reason.
3. **Where the copies go (the rules).** All of them are numbers of the record, shown as a short form:
   - **Spacing:** a **distance** between copies, or a **count equally divided** (an open path: the first and last copies at its ends; a closed one: the count equally round it).
   - **Ends** (for a distance on an open path): **leave the remainder at the end** (the copies at 0, d, 2d, ...), **fit**: the spacing is adjusted a little so the last copy lands on the end (the count is the nearest whole one, and the adjusted spacing is shown), or **centre**: the copies are centred, the leftover shared between the two ends.
   - **Start inset and end inset:** the first and last copy stand this far from the path's ends (so a path that ends at a block's corner can have its first copy 8 mm along from it).
   - **Corners** (a path with corners: a rectangle's outline, any chain): **ignore them**, or **put a copy at every corner and divide each side between them** (the spacing adjusted on each side so the corners are always taken: "a fastener in the corner even if it means adjusting the spacing a little"), or **work in from the corners** (distance steps counted from each corner towards the middle of the side, the leftover in the middle of the side).
4. **What the copies are.** At each place the machine gives a **frame**: the point, the way the path runs, and the way across it in its plane. A copy **keeps the orientation** of the original by default (as a linear repeat does); a choice, **turn with the path**, turns each copy by the angle the path has turned since the start (for a bolt circle or a row along a curve).
5. **What it repeats (three consumers of one machine).**
   - **A drawn figure** (corners, lines, a circle and their relations), as the linear and circular repeats do (`Scene.patterns`, a record of kind `path`: the figure's parts, the path's refs, the numbers).
   - **A body** (the existing `pattern` step, with a path kind: the copies are joined to it, as the linear repeat's are).
   - **A fastener hole** (`dec_parts_fastener_pilot`): the **Fastener Holes** dialog takes a path and the rules, and cuts a receiver at each place; the copies follow the path if it is edited (the hole is a step made from the record's places).
6. **How it is built, in order (each piece is tested alone and used by the next):** (a) the pure machine: a path in, rules in, frames out (`operation/pathrepeat.ts`, no scene, no kernel); (b) a repeat of a **drawn figure** along a drawn path, with the editing of its numbers; (c) a repeat of a **body** along a path; (d) the **fastener holes** along a path or a face's outline, with the rules. The tool is offered in the Repeat group of the right-click ring, beside Linear and Circular.
7. **Limits of the first slice:** paths of straight lines and circular arcs (a spline path later); a path in one plane (a path in space later); the offset for a path in a plane only; nothing is moved or turned in three dimensions along a twisting path.

## To settle (not decided)
- **The name.** The human's word is "sweep pattern repeat"; **Sweep** is already a solid operation (a closed sketch carried along a path), so the AI proposes **Path repeat** in the menu.
- **The order in 6.** The AI proposes the machine first, then a drawn figure, then a body, then fasteners; the human may want the fasteners (the use that started this) before the body repeat.
- **A path that is the outline of a face with holes** (a plate with a hole in it): the outer outline only by default; the others by choice.

## Rationale

A fastener pattern, a repeat along a curve and a bolt circle are the same thing: places along a path. Building the machine once, as pure arithmetic on a path, lets the figure, the body and the fastener each use it and keeps the rules (spacing, corners, insets, offset) in one place that can be tested without a kernel. Following the repeats the program already has (a record with numbers, copies derived and named stably) means a path repeat edits, saves and undoes like them. The name avoids the word the program already uses for a different thing.
