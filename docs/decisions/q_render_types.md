---
id: q_render_types
kind: question
status: open
origin: ai-unreviewed
human_input: in_1703
date: 2026-11-28
depends_on:
  - dec_view_looks: this proposal keeps its looks (solid, see-through, the cut, a mark laid over) and says how a mark and every other overlay is drawn, so a change to those looks changes this
  - dec_task_handles: the pull arrow and the orb are handles, not render types; this entry must not add a fourth kind of handle
alternative_to:
---
# A handful of render types, reused by everything that shows a body

**The human asked** (`in_1703`) for the old prototype's body look and handling to be rebuilt cleanly: body and wire-frame rendering, how faces and edges are picked and offer the pull arrow and the round / chamfer arrow, "only a handful of render types reused by everything downstream; the old app kept minting new ones for new operations".

**What the old app did** (read in `app/src`, by a helper; the numbers are from reading, the app was not run). `ui/looks.ts` declares four looks, yet about sixteen different things are drawn: the "Marked" look alone is made by six materials, and three machines draw hover and selection (a shader disc, plain fills, line batches). Red is declared twice with different values (0xe5484d, 0xe46a6a); amber, green, blue and orange live as literals in several files; the arrow head is made twice; edges are made three ways. Its drag preview of a pull has no look of its own: it re-meshes the kernel's real answer for each size (`dec_drag_preview_without_kernel`).

## The proposal (not reviewed)

Everything drawn in the 3D view of a body, or a part of one, is **one of five render types**, each with a tone (one palette) and a strength; a feature says *(type, tone, strength)* and never makes a material, a colour or an opacity of its own.

| # | Type | What it is | Used for |
|---|---|---|---|
| 1 | **Solid** | the body's surface, lit | every body |
| 2 | **See-through** | the dark nearly clear surface, no depth write | wireframe body, a body behind the sketch plane, a stand-in, the ghost of a pull or a round |
| 3 | **Wash** | a flat translucent colour laid over a region (faces of a body, a closed sketch, a hover disc) | hover (teal, faint), picked (teal, strong), tied (yellow), clash and refusal (red), the closed sketch's tint |
| 4 | **Stroke** | a pixel-wide line: tone, weight (thin or bold, `in_1677`), solid or dashed | a body's outline, a hovered or picked edge, the outline of a ghost, a sketch's lines, an arrow's shaft |
| 5 | **Dot** | a point marker (already one kind, `in_1675`) | a picked corner, a hint |

Not render types: **the cut** (Solid clipped by a plane, with its hatch: `cutdraw.ts`); **handles** (the pull arrow and the orb are built from strokes and one cone, `dec_task_handles`); chips, bubbles and the info bar (the page, not the 3D view).

**Tones, one palette** (`interaction/style.ts` already has it for the sketch): teal selected or pointed at; yellow offered or tied; red a refusal, a clash, what a cut takes away (one red); charcoal for edges; the rest grey. A new operation chooses among these; a new type or tone needs a decision here first.

**How the old pieces map:** hover a face = wash teal faint; picked face = wash teal strong + stroke bold on its edges; hover or picked edge = stroke teal thin or bold; the pull's ghost = see-through + stroke; a clash or thin wall = wash red; a hidden body = see-through, fainter; section = the cut; a closed sketch = wash teal at 6%.

## Where the rebuild stands (checked in `next/`)

- `looks.ts` is the one place for types 1 and 2 and for the marks' colours, and `style.ts` for strokes and dots in the sketch: good.
- Washes and strokes **on bodies are made in `overlaydraw.ts` with numbers of their own** (marks 0.5 and 0.22, line widths 4 and 3, the ghost 0.55, 0.35, 0.25, 0.9), and the orb's meshes in `orbdraw.ts`: the same habit as the old app, in a smaller way. Putting them through one small builder per type is a behaviour-neutral cleanup the existing checks can guard.
- **Gaps against the old app that stop the engine being used by hand:** there is **no way to put a body in wireframe** (the see-through look is applied only while a sketch is active, and only to the stand-in boxes, not to the bodies the engine makes); **round and chamfer show no preview** while the arrow is pulled (`roundOp` has no ghost); a picked face lights at once (the old app spreads the teal from the click over about half a second); the chamfer has no Variable or Two-distances option (`dec_chamfer_two_distances`); no hidden-body veil or thin-wall measure.
- Already built and in line with this: picking a face or edges by the step names, the marks, the bar with Sketch / Push-pull / Round / Chamfer, the one `Operation` description and one controller (`operationcontrol.ts`), the one pull arrow on a face or an edge.

## For the human to say

1. Are these five the handful (and the one palette), or should one be added, merged or dropped?
2. **A preview while the arrow is dragged** (face pull, round, chamfer): (a) a ghost drawn from the picture, as the push has now (cheap, approximate; no engine call per drag); (b) the old app's way, the engine's real answer for each size (exact, needs the engine fast enough); (c) a ghost for push and the engine's answer for round and chamfer.
3. **Wireframe:** a toggle in the ⋯ list (the whole model), or per body? The old app set it from the menu and in a few operations.
4. **Order:** first the behaviour-neutral cleanup (everything through the five types, guarded by the existing checks), then the missing pieces; or the missing pieces first on the existing code?

## Rationale

The human asked for few render types reused downstream and said the old app kept making new ones for new operations. Naming the types by what they are (a surface, a wash, a line, a point), not by the operation that uses them, is what lets a new operation reuse them: it picks a type, a tone and a strength. The earlier decision (`dec_view_looks`) already did this for surfaces; the overlays (hover, pick, ghost, clash) are where the old app's count grew, and the rebuild is starting to repeat that.
