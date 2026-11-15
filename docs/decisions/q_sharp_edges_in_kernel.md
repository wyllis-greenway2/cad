---
id: q_sharp_edges_in_kernel
kind: question
status: open
origin: ai-unreviewed
human_input: in_468
date: 2026-11-15
depends_on:
  - dec_sharp_edges_once: step 1 is built; this is what would be done after it, if it is still worth it once it is measured
  - dec_description_cache: the per-body description (mesh, faces, edges) is kept by what the body looks like; the sharp edges would be kept with it
alternative_to:
---
# Find the sharp edges in the kernel's thread, once per body (step 2)?

The thread would find the sharp edges of each body when it describes it, keep them with the body's description, and send them in the answer; the page would draw them and not search any triangles. A block edit beside lofts would then cost the edges of the block only (with step 1 alone the first build of every edit still searches the whole mesh: about 15 ms of the 25 to 45 ms on `really_slow.json`). The answer gets one more array (about as large as the edges already sent) and the cached answers of `dec_description_cache` grow by it. **Not approved** (`in_468` approved step 1 only); the first thing to do is to measure again after step 1 on the human's own machine.

## Rationale

Asked, not decided: the gain is the remaining search for edges at each edit, and it is only worth the larger answer if that search is still a noticeable part of the wait.
