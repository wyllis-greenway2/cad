# Sketching: the requirements (a draft from a first prototype)

Status: **a draft, `ai-unreviewed`**, written after a first prototype was built (`in_1462`) so the human can say what is right and what is not. No tests until he is happy with it (`in_1444`). The old app's sketching (`dec_interaction_spec`, `dec_sketch_*`, `dec_touch_sketching`, `in_147`, `in_193`) is far larger (arcs, polygons, constraints, typed sizes, snapping to many things, drag editing); only three tools are started, as asked.

## What there is now
- The right-click ring (as the old app's): a **pencil** bubble opens a ring of its own (an unfolding, a cross to go back) with **Line**, **Rectangle**, **Circle**; beside the pencil, **Sketch plane**.
- Choosing a tool **turns the view straight to the plane that is on** (a world plane, or the placed sketch plane), orthographic, unless it is already, and the tool is on.
- **Line:** each click lays the end of a segment, a chain; a double click ends the chain. **Rectangle:** two clicks, opposite corners. **Circle:** the middle, then a point on it. The tool **stays on** after each figure.
- What the next click would make is shown as the pointer moves (teal), with a small cross where the pointer is; figures done are charcoal lines.
- **Snapping:** the point goes onto an end, a corner or a middle of an earlier figure within 10 px, else onto a grid crossing within 10 px.
- **Right click** (or Esc) gives up the figure under way; with none, it puts the tool away; then the ring opens again.
- Figures are kept **in the plane's own axes**, so they go with a placed plane when the orb moves it; a world plane keeps its own; a placed plane's are let go with it.
- The orb is out of the way while a tool is on.

## Rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |
|---|---|---|---|---|---|---|
| K1 | The ring's pencil opens a ring of Line, Rectangle and Circle that unfolds from the pencil, with a cross that goes back; choosing a tool closes the ring. | in_1462 in_133 in_143 | right click without movement | `Intents` | browser | later |
| K2 | Choosing a tool turns the view straight to the plane that is on (orthographic) unless it already is, and the tool is on until put away. | in_1462 in_229 in_193 | | `ViewState` | browser | later |
| K3 | **Line:** a click puts the first point, each next click a segment from the last point; a double click ends the chain. **Rectangle:** two clicks, opposite corners (axis-aligned in the plane). **Circle:** a click for the middle, another for a point on it. A second click on the same place makes nothing. | in_1462 in_062 in_069 | click | `Sketch` | unit | later |
| K4 | The tool stays on after a figure; a right click or Esc gives up the figure under way, and with none puts the tool away. | in_1462 in_193 in_244 | right click, escape | `Sketch` | unit | later |
| K5 | A point sticks to an end, a corner or a middle of an earlier figure (the middle of a circle, and the four points on it) within 10 px, else to a grid crossing within 10 px of the grid's spacing; the distance is so many pixels wherever the view is. | in_1462 in_652 | | `Sketch` | unit | later |
| K6 | Figures are kept in the plane's own axes: they move and turn with a placed plane, and each plane keeps its own; a placed plane's figures are let go with it. | in_1462 in_233 in_234 | | `Sketch` | unit | later |
| K7 | What the next click would make is drawn as the pointer moves, with a cross at the pointer; figures done are charcoal lines, pixel-wide, drawn on top. | in_1462 | hover | `Drawing` | browser | later |
| K8 | Not yet: arcs, polygons, typed sizes, constraints, selecting and editing a figure, closed figures making a face, a sketch's own cut when it is on a face, undo. | in_1462 | | | later | later |

## Contracts
- `Sketch` (`src/sketch.ts`): the figures, the tools and snapping, pure; `src/sketchcontrol.ts` the controller (the host says where each plane is).
- `Intents` (`src/input.ts`): `click` with its count, `menu`.
- `ViewState` (`src/view.ts`): `lookAt`, `lookAlong`.
- `Drawing` (`src/world.ts`): `lines`.

## Inputs this section claims
- mouse: left click with a sketch tool on; double click with a sketch tool on; right click with a sketch tool on
- keys: escape ends the figure or the tool
