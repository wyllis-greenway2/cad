---
id: q_motion_detail
kind: question
status: open
origin: ai-unreviewed
human_input: in_165
date: 2026-11-06
depends_on:
alternative_to:
---
# Should things in motion be simplified and settle into fine detail when the motion stops?

The human asked whether the chunkiness while changing a size (a cylinder's diameter) comes from the limited graphics and compute available, and suggested things in motion could be simpler, then settle finer once motion stops. My reading and proposal:

**Where the chunkiness comes from.** Two different things: (1) *how fine the mesh is* (a small post was a coarse prism), which is about the mesh's quality per size; (2) *how often the picture updates while dragging*: every size is a new kernel build (30 to 120 ms), so it updates about 10 to 30 times a second in jumps, whatever the machine's graphics. The screen itself is not the limit: drawing a body costs almost nothing next to the kernel build.

**Proposal: three levels of detail.**
1. *Moving* (a drag in progress): show what is cheap to compute locally and at once (rings and lines for a round face's new size, a ghost outline for a push / pull, the moved copy of a body for a move), and let the kernel's body lag behind it.
2. *Just stopped* (about 150 ms with no change): the kernel's normal body.
3. *Settled* (a second or so idle): a finer mesh of the same body, asked for once, swapped in without anyone noticing.
Plus: the mesh's fineness follows the part's size (built in `in_165`).

**Not decided:** whether to add the "settled" refinement (it needs a second kernel request and a swap in the page); which operations get a local ghost (round face done; the others are candidates); whether to adapt to the device (a phone could settle sooner, a fast machine could skip the moving level).

## Rationale

Nothing depends on this yet. Kept open until the human says which levels to build.
