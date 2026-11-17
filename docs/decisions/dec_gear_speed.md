---
id: dec_gear_speed
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_689, in_694
date: 2026-11-17
depends_on:
  - dec_speed_rules: the kernel-side rules this extends (checks, rough first, one sweep); a change to them changes which of the costs below are still there
  - dec_worm_gears: the wheel is a loft through sections of the worm's cut; a change to how it is made changes the proposals for it
  - dec_highlight_batching: the page-side half of the same asked-for work (what is drawn is a few batches); sized by the same measuring
---
# Why many gears, many teeth and worm wheels are slow, and what would fix it (measured; most of it built, see Landed)

**Asked (`in_689`):** too many gears, gears with many teeth, worm gears and above all worm wheels are so slow they nearly crash the app, even one of them. Measured in Node with the kernel in the same process, one run each, a sandbox with few cores (good for comparing, not for absolute times).

| case | time | what the time is |
|---|---|---|
| spur sketch, 20 / 60 / 120 / 200 teeth | 25 / 32 / 93 / 186 ms | the sketch only: 24 parts a tooth |
| the same extruded 10 mm | 750 / 1300 / 2600 / 5200 ms | the kernel; the scene then has 1931 / 4827 / 9619 / 16023 parts (about 80 a tooth: a face and its edges for every arc of every flank) |
| 1st to 6th spur gear of 30 teeth, extruded, one after another | 0.8, 1.9, 2.0, 2.5, 3.3, 3.2 s each (13.8 s in all) | the new body's extrude is about 400 ms each time; the rest (2 to 3 s and growing) is work that covers the whole model on every edit |
| worm (24 mm, 30 long) | 0.6 s | |
| **worm wheel, 24 / 40 / 80 teeth**: the page works out the sections | 2.4 / 3.8 / 6.8 s | `wheelsections.ts` `material`/`inside`, marching squares over **every** gap of the wheel, in the page (main thread), on the way into `addGear` |
| worm wheel, 24 / 40 / 80 teeth: the kernel (sections already cached) | 1.4 / 10.5 / 9.0 s | the loft through the 5 sections 7.9 s, naming its faces (`nameFaces`/`surfacesOf`, freeform faces) 4.5 s, 12000 to 15000 parts in the scene |

For the 40 tooth wheel the whole is 14 s; the page is blocked for the first 3 s of it, and the kernel's job limit is 60 s (`kernel-async.ts`).

## Landed (`in_694`: "yes land those three changes with tests")

Three changes, from `prototypes/wheel-fast` (the numbers are in its README): **the quick box for naming the freeform faces of a shape that has more than 64 of them** (`facenames.mjs` `quickBounds`, `QUICK_FROM`: 4.2 s to 8 ms of the 10.3 s kernel time of a 40 tooth wheel, same volume; a loft's own sides are named by comparing the exact box of each face with the box of the sketch's corners, so a body with few freeform faces keeps the exact box, found by the suite); **the faster wheel sections** (`wheelsections.ts`: 10 bisections, a coarse grid first, exact crossings only for chains that can pass, a scan step of 0.2 mm along the thread; 5 to 7 times quicker, within 0.003 mm); **`BRepLib.SameParameter` after a smooth loft** (`interpreter.mjs`: the wheel is no longer refused for 24, 28, 30, 32, 44, 48, 60 teeth). Tests: `test/wheelspeed.test.ts` (the sections against the old scan's numbers; the time; the counts that used to be refused, with their volumes; a bored wheel; the quick box). Of the five proposals below, 1 and 2 are done, 5 is built as `dec_gear_standin` (a plain disc while the body is made, `in_695`), and 3 as `dec_gear_feature` (a gear's body has a few parts, `in_696`); 4 (per-body checks) is not built.

## Causes, and the fix that goes with each (the first two are landed; the rest are for the human to choose from)

1. **The wheel's sections and loft** (`in_692`, measured in `prototypes/wheel-fast`): the sections were already one gap turned z times, so that was not the cost; the cost is the scan over the worm's turns at every grid node and every bisection. A faster scan makes them 5 to 7 times quicker (40 teeth 3.4 s to 0.5 s) within 0.003 mm. **Naming the loft's faces took 4.3 s of the kernel's 10.3 s** only for the exact box of each freeform face; the quick box takes 8 ms and gives the same volume. **The smooth loft was refused by the kernel's validity check for about half the tooth counts** (30, 60, 24, 28, 32, 44, 48 failed at module 2 with a 24 mm worm). **Cause (`in_693`):** the loft's edges did not have the same parameter on the 3D curve and on the faces; the solid was whole (same volume to every digit). **Cure:** `BRepLib.SameParameter` on a smooth loft, three lines in the loft op; every count from 12 to 60 then builds, a bore cuts exactly. Together with the quick box and the faster sections a 40 tooth wheel takes 7.0 s in all against 13.7 s, and 24 and 60 teeth now build. One tooth lofted and joined is not tried: the loft is now reliable, and what is left is the loft's own time and the mesh.
2. **The sections are worked out in the page.** After the faster scan they take about half a second at 40 teeth, which is short enough to leave there; moving them to the worker is dropped unless 200 teeth is still long.
3. **Faces are many and every later stage is by face.** About 80 parts a tooth: a face for each of 8 or more arcs a flank, named, described, meshed, picked, listed in the scene, highlighted. A gear as a **feature** with few selectable parts (the tooth flanks of one gear are one part, as a cylinder's wall is one face) removes most of the page's and the naming's work for every gear, and the **Detail** setting already there (`dec_speed_rules` 8) can be lowered for large tooth counts by default.
4. **An edit pays for the whole model, not for what changed.** With six gears each new one costs more (0.8 s to 3.3 s) though its own extrude is 400 ms: the fingerprints of every step, the validity and self-crossing checks of the whole compound, the edge names of the final solid and the description fingerprints all cover every body. Bodies that do not touch are independent: keep the checks, names and fingerprints per body (the description cache already is, `describedMs 0`) so a new gear costs what it is.
5. **Warn and degrade before the limit.** A gear or wheel whose estimated cost is large (teeth times arcs, wheel teeth) draws its wireframe preview (`dec_speed_rules` 7) and builds the solid after a pause, with the job's time shown, rather than appearing to hang for 10 s.

## Rationale

The measuring shows two separate things: a few places where the work is simply too big (the wheel's sections and loft: proportional to teeth, where one tooth would do), and a general one (the cost of every edit grows with the size of the model, so a second and a third gear are what make a single gear's time unbearable). The first is a local rewrite of one file with a test against the present sections (same shapes, to a tolerance); the second is the holistic one the human asked for and is checked with the same script before and after (six gears one after another).
