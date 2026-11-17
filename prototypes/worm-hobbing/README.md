# worm-hobbing (prototype, `in_605`)

**Meant to learn:** how long a throated worm wheel takes the exact way, by cutting the worm out of a blank at many positions (hobbing), so the estimate given at `in_601` is a number.

**Run (from `app/`):** `node ../prototypes/worm-hobbing/bench.mjs [positions a tooth] [teeth]` (replicad directly, so it is the kernel's cost without the app's own checks).

**Setup:** single start worm, axial module 2 (lead 6.28 mm), pitch radius 12, 20 degree flanks, 30 mm long (4.8 turns of thread on a core); wheel of 30 teeth, module 2, blank 66 mm across and 12 mm wide; centre distance 42; 24 positions, each the worm turned 15 degrees about its own axis and carried 0.5 degrees round the wheel (one tooth pitch of the wheel in all).

**Learned (2026-11-16, in a sandbox with few cores):**
- making the worm (core, thread sweep, fuse): 0.5 s;
- the first cut 0.46 s, then **each cut slower: 1.8 s at the second, 7 s from the tenth, 8.3 s at the 24th** (the blank has only 80 faces by then, so the cost is the worm's thread, not the blank);
- **24 cuts, one window of one tooth pitch: 153 s (2.5 minutes).** The worm covers about 5 teeth at a time, so for 30 teeth there are about 6 windows: **about 15 minutes for a whole wheel**, and again at every change of a number;
- the volume stops changing from the 9th to the 16th cut (the first cuts already take the thread's own shape; the later ones only refine the flank), so fewer positions would do for a rough wheel; the quality of the result was not looked at.

**Not tried:** a shorter tool (only the part of the worm that meshes, perhaps 1.5 turns instead of 4.8: three times less thread), fewer positions, cutting all of a window's tools in one boolean, a coarser thread. Each might bring the time down several times, to minutes, not seconds.
