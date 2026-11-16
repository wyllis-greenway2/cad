---
id: dec_chamfer_two_distances
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_431, in_432
date: 2026-11-15
depends_on:
alternative_to:
---
# A chamfer with a distance along each face (distance-distance)

`in_431` asked for a chamfer with two distances besides the equal-distance one. **Can be built:** the kernel takes it (`chamfer({ distances: [d1, d2], selectedFace })`), where `selectedFace` names the face d1 is measured along, one face for the whole call. **Choices for the human:** (1) which face is d1 along: *recommended* the face the person picks (click a face of the selected edge; a swap button turns d1 and d2 round), so several edges can share one face only if they all lie on it, else the edges are done one at a time in a single step; (2) how it is shown: *recommended* a second field and arrow in the chamfer's bubble, Tab goes between them, `value` is d1 and a new `d2` is the other, with equal as the default (d2 empty); (3) the fallbacks: the region fallbacks (curved faces, variable sizes) take equal distances only at first, and a distance-distance chamfer they cannot make is refused with the reason, not approximated. **Approved as recommended (`in_432`); building.

**Built (`in_432`):** the chamfer's size chip gets *Two distances* once the size is a chamfer and the straight edges selected all lie on a flat face, and *Swap faces* beside it; two numbers (the first along the lit face, the second along the other; Tab goes between them; equal until the second is typed); the lit face is drawn selected; the step has `mode: chamfer`, `value` (d1), `d2` and `face` (`nx,ny,nz,d,px,py,pz`), and is never chamfered together with other steps. The kernel measures d1 along that face (`chamfer({distances, selectedFace})`); an edge that does not lie on it, a face that has gone, or distances the kernel cannot make is refused with the reason and nothing is approximated. **Not built:** choosing the face by clicking it (only the swap), curved faces for d1, edges on different faces in one step.

**Changed (`in_517`):** the chip is offered whenever the edges lie on a flat face, as Variable is, not only while the size is negative: it used to vanish as the pointer left the arrow for the chip (the live size changed sign on the way). Choosing it makes the operation a chamfer whatever the sign of the arrow.

## Rationale

The first face is the real choice: the kernel needs it, and a rule that is invisible (the face with the lower reference) would make d1 and d2 swap for no reason the person can see.
