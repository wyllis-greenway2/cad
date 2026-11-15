---
id: q_chamfer_two_distances
kind: question
status: open
origin: ai-unreviewed
human_input: in_431
date: 2026-11-15
depends_on:
alternative_to:
---
# A chamfer with a distance along each face (distance-distance)

`in_431` asked for a chamfer with two distances besides the equal-distance one. **Can be built:** the kernel takes it (`chamfer({ distances: [d1, d2], selectedFace })`), where `selectedFace` names the face d1 is measured along, one face for the whole call. **Choices for the human:** (1) which face is d1 along: *recommended* the face the person picks (click a face of the selected edge; a swap button turns d1 and d2 round), so several edges can share one face only if they all lie on it, else the edges are done one at a time in a single step; (2) how it is shown: *recommended* a second field and arrow in the chamfer's bubble, Tab goes between them, `value` is d1 and a new `d2` is the other, with equal as the default (d2 empty); (3) the fallbacks: the region fallbacks (curved faces, variable sizes) take equal distances only at first, and a distance-distance chamfer they cannot make is refused with the reason, not approximated. **Not built.**

## Rationale

The first face is the real choice: the kernel needs it, and a rule that is invisible (the face with the lower reference) would make d1 and d2 swap for no reason the person can see.
