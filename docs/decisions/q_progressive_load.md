---
id: q_progressive_load
kind: question
status: open
origin: ai-unreviewed
human_input: in_906
date: 2026-11-18
depends_on:
  - q_limits_and_failures: the measured limits (a project of 300 separate parts 17 s to open, 1000 parts a 33 s freeze, about 961 bodies at the kernel's 4 GB) are what this is meant to remove
  - dec_gear_standin: the stand-in (a ghost of what is being made, drawn from the record alone) is the pattern this extends from gears to every body
  - dec_per_body_checks: bodies are kept by the identity of their own solid and are described one at a time; a progressive build uses that
  - dec_gear_feature: a gear body keeps a few parts instead of one for every face; the same idea for every body that is far or not touched
---
# Open a big model by showing the whole of it at once as ghosts and filling in detail from the camera outwards

**The human's idea (`in_906`):** do not load everything at once; put the person in the scene at once; fill in models and data from the camera backwards; keep the interface smooth after the load; draw what is near in full and the rest as ghosts (as a gear is a ghost disc while it is made); give detail and fidelity by camera position and selection.

**What it costs now (measured, `q_limits_and_failures`):** opening replays every command and derives the whole scene after each (the page frozen 4.4 s at 300 parts, 33 s at 1000, 441 MB); the kernel then builds all bodies in one answer (12.7 s at 300 parts, over 60 s past about 600, 3.8 GB at 961 bodies); the page then holds about 10 scene parts for every face of every body (104 thousand parts for four wheels), and the kernel describes every body in full. Nothing of the model is drawn until the one answer comes.

**Proposal (the AI's, in phases; each is checked on its own by the numbers above)**

*Phase 0, small, first: stop the replay being the freeze.* Open applies all the commands and derives **once at the end** (snapshots become lean at once, `history.ts`), and in slices between frames with a progress sign if it is still long; keep the last good scene when a step cannot be made; keep a copy of the project in the browser as it is worked; refuse a step before the kernel's memory reaches the crash. Expected: the 33 s freeze to a few seconds; no blank model; a crash that does not lose work.

*Phase 1: the ghost first.* Every body that a step makes from a sketch and a depth has a **ghost drawn from the commands alone** (the sketch's outline, the depth, its place: a box or prism, as the gear's disc is drawn from its record): the whole model is in view at once, in the camera's place, in tens of milliseconds, drawn as one batch. The kernel then **builds the bodies in an order the camera gives** (selected, then in view and near, then in view far, then the rest), **one body or a few at a time**, and each answer replaces its ghost. This needs the kernel to answer in pieces: a body that no later step touches (a push or a revolve in "new" mode, a pattern copy, a gear) is independent and can be made, kept and described alone (the per-body keys of `dec_per_body_checks` already say which); a chain of joins and cuts is built together, in order. The 60 s limit then applies to a piece, not to the model.

*Phase 2: fidelity by distance and selection.* The mesh of a body is made as fine as its size on the screen needs (the kernel already makes a rough "draft" mesh and a coarser one for heavy bodies): far bodies coarse or as their ghost, merged into few draw calls; the body being looked at or selected full, with its faces, edges and corners (the parts for picking) made **when it is hovered or selected** and not for every body (the gear feature already does this for a gear); far bodies get no edge lines. Moving the camera re-orders the work; work no longer needed is dropped.

*Phase 3: a kernel that does not hold everything.* The kernel keeps the solids it needs (the near ones, the selected) and lets the rest go, making them again when the camera comes back, so the 4 GB is no longer the size of the model; the answers kept by the page (the meshes) are bounded by a budget, as the descriptions are.

**What is not simple:** a change to an early step still invalidates every later one (the quadratic edit cost: it is only as cheap as the independent bodies are independent); bodies that touch (joins, cuts, fillets between them) must be made together; picking, measuring and clearance checks need the true shape and wait for the body (as they wait for the kernel now); the draw-call and triangle limits of a phone are not measured here. **Recommendation (the AI's):** Phase 0 now (small and certain), then Phase 1 as a prototype in `prototypes/` on the 300 and 1000 part projects to see how much of the time to the first picture and to the last body it takes.

## Rationale

The human asked how to make big models fast and tolerant of their size; this records the direction and its parts so that the order is theirs to choose. Nothing is built.
