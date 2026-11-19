---
id: q_mesh_body
kind: question
status: open
origin: ai-unreviewed
human_input: in_1020
date: 2026-11-19
depends_on:
  - dec_import_mesh: a mesh comes in as an exact solid made of its triangles, which is why there is a size limit and why a big mesh is reduced; a mesh body kind would change that
  - dec_exchange_gaps: the repair and the reduction on import (this entry is what they are a stopgap for)
alternative_to:
---
# Should a big mesh be a true mesh body, not a reduced solid?

**Today (`dec_exchange_gaps`, `in_1020`):** a mesh of up to 300,000 triangles is read; small holes are filled; one of over 12,000 triangles is **reduced** (quadric edge collapse) to a number the app builds into a solid (about 5,400 triangles for a curved part; a boxy one reduces to its few flat faces with no change). The result is an exact body the whole app edits, but **a curved part loses detail** (a sphere of 82,000 triangles became 5,400: volume −0.09 %), and a file that is exported again is the reduced mesh, not the original.

**The alternative:** a **mesh body** kept as the original triangles and drawn and exported as they are, moved, turned, scaled, measured, mated by its box, and combined for the bed layout; with **no push and pull, cut or fillet** (those need an exact solid), unless a reduced copy is kept beside it for the operations that need one. It is a new kind of body that the picture, the picking, the mates, the booleans, the export and the hard bodies each have to learn (the reason `dec_import_mesh` did not build it).

**Recommended, for the human to decide:** keep the reduction for now; build the mesh body only if people need to put downloaded models on a plate or design round them at full detail, which is a use the reduction does not serve. **Questions for the human:** is it for reference (design round a part: the reduced copy is enough), for a bed layout of downloaded files (needs the original on export), or to edit (the exact solid is the right body)?

## Rationale

The reduction was chosen first because it gives every mesh the app's whole set of edits at once and costs one function; the mesh body is the larger piece and serves a different use. The AI recommends waiting for the human's use before building it (`prin_function_over_form`).
