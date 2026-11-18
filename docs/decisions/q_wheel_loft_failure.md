---
id: q_wheel_loft_failure
kind: question
status: open
origin: ai-unreviewed
human_input: in_857
date: 2026-11-18
depends_on:
  - dec_worm_gears: the wheel is a smooth loft through five sections of 200 teeth's arcs; the failure is in that loft
alternative_to:
---
# Why does a 200 tooth worm wheel of module 1.02 or 1.03 fail to loft?

Found while looking at the kernel in the real app (`in_857`): a 200 tooth, one start worm wheel (a 24 mm worm, width 10) of module 1.0, 1.01 and 1.04 lofts; of module 1.02 and 1.03 the kernel's `BRepOffsetAPI_ThruSections` throws a wasm exception, which is shown as "the kernel could not make this step (it gave no reason)". It is the same without the compatibility check and was the same before the loft changes of this session (checked on an older commit); it is not the memory (a thread of 1.3 GB, the same count of faces and the same edit sequence succeed at other modules), and the sections have no short edge (the shortest is 0.43 mm at every module). Other options of the loft (checked or not, other parametrisations, a lower degree, no smoothing) throw as well on the same sketches. A loft built straight from the sections' arcs (the prototype in `prototypes/wheel-tooth-loft`) succeeded at 1.02, so the difference may be in the sketches the step makes from the scene's parts (rounded corners, an arc's middle from its bulge).

**Not decided:** whether to chase it (the sketch of a wheel built from the exact sections' arcs, or a retry with a tiny change of a corner) or to leave it, since 200 teeth is extreme and the person is told the step failed. **Recommendation (the AI's):** find what the sketches differ by first; if it is the rounding, build the wheel's sketches from the sections' own numbers.

## Rationale

A recorded finding with a recommendation, so it is not lost; nothing in `app/` changed for it.
