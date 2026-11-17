# worm-wheel-loft (prototype, `in_607`)

**Meant to learn:** whether a throated worm wheel made as a **loft through a few sections** is accurate enough to be a usable gear, against the exact wheel (what the worm leaves of a blank), and how the time compares with hobbing (`prototypes/worm-hobbing`: 153 s for one window).

**Run (from `app/`):** `K=5 node ../prototypes/worm-wheel-loft/wheel.mjs` (`NOINT=1` leaves out the overlap test).

**Method.** One single start worm (module 2, pitch radius 12, 20 degree flanks) and a wheel of 20 teeth, 12 mm wide, whose tip surface is an arc about the worm's axis (the throat: tip radius 22 in the middle, 24 at the faces).
- *The exact wheel* is a test, not a solid: a point of the wheel is cut if at some turn of the worm (the wheel turning 1/20 as much) it is inside the worm's thread, found by scanning 1067 turns (`material`). The worm's solid is the infinite thread.
- *A section at height h* is the gap between two teeth as a curve, found by marching squares on that test over two pitches in (angle, radius) with every edge crossing found exactly by bisection (a nearly radial flank is no trouble; an earlier version, the radius as a function of the angle, could not draw one and was wrong), cut into 18 pieces of equal length, each an arc through its ends and its middle, and the top of the tooth one arc. Every section has the same pieces, so they loft.
- *The wheel* is the kernel's smooth loft (`loft`, not ruled) through K sections at equal heights. The twist of the teeth, the throat and the change of the tooth shape across the width are all in the sections: nothing else was assumed.
- *Accuracy* is, from each vertex of the loft's mesh, the distance along its normal to where the exact material ends (a sample of about 250 vertices; the flat ends left out). *Overlap* is the kernel's boolean intersection of the loft with the worm solid (built by a helical sweep, as in the hobbing benchmark) at four turns, the wheel turned by the matching amount: it is also a check that the exact wheel is the right one.

**Learned (2026-11-16, in a sandbox with few cores):**

| sections | worked out | loft | worst outside the exact surface (in the worm's way) | worst inside | mean | overlap with the worm, four turns |
|---|---|---|---|---|---|---|
| 3 | 15 s | 0.7 s | 0.19 mm | 0.08 mm | 0.04 mm | 0.04 to 0.41 mm3 |
| 5 | 25 s | 0.9 s | **0.05 mm** | 0.05 mm | **0.009 mm** | **under 0.07 mm3** (the negatives are the noise of the boolean) |
| 9 | 44 s | 1.4 s | 0.06 mm | 0.04 mm | 0.009 mm | |

- **A loft through 5 sections follows the exact wheel to about 0.05 mm** (a 40th of the module); 9 sections are no better, 3 are four times worse. The sections themselves lie on the exact surface to 0.002 mm.
- The overlap of the loft wheel with the real worm solid is a few hundredths of a cubic millimetre: the exact wheel is the right one, and the loft is a wheel that meshes.
- **Time:** the loft itself is **about 1 s**, against **153 s per window (about 15 minutes) for hobbing**. The 25 s for five sections is this prototype's brute-force scan (a thousand turns at every grid node, in JavaScript); the section of a worm wheel is a conjugate curve that can be worked out in closed form, or by a coarse grid with a local search, and the 25 s should come down by one or two orders of magnitude. **That is the work that is left, not the loft.**
- 0.05 mm is below what an FDM printer holds (about 0.2 mm) and about the backlash a printed worm drive is given anyway.

**Not tried:** a wheel with a bore and key, several starts, a different lead angle or tooth count (the method does not depend on them); a wheel cut by a real hob and measured; the worm itself as a tool; the speed of the sections at a rate a number box can use.
