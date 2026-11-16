# helical-feasibility (prototype, `in_562`)

**Meant to learn:** whether the kernel can carry a gear outline (about 100 arcs, with a bore) along its own axis while it turns, using the existing twist about the plane's normal (`dec_spiral_extrude`), so helical gears can be made from the flat gear outline.

**Run (from `app/`):** `node --test ../prototypes/helical-feasibility/try.test.ts`

**Learned (2026-11-16):** it works, with no change to the kernel or the revolve step. A gear made by the gear command, its outline revolved about its own normal with `value` = twist (degrees) and `advValue` = width, for 12, 20, 40 and 60 teeth, with and without a bore, twists of 5.6 to 17.4 degrees:
- no errors, and the volume equals the flat extrusion's (within 0.0001 of it), as a screw motion must;
- it takes **1.2 to 5 seconds** (20 teeth: about 2 s; 40 teeth: 5 s; 60 teeth: 4 s). Every change of a number re-makes the body, so editing a big helical gear would be slow;
- the turn direction is the sign of the angle (the hand).

**Not tested:** the shape against a real helical gear (only the volume), meshing, a twist of a herringbone, the preview while the numbers are typed (the revolve's preview is a wireframe).

## Where the time goes (`in_563`, 40 teeth, module 1.5, 6 mm bore; ms; measured with temporary timers, since removed)
- A **flat** extrusion of the same gear already costs about 1.4 s (840 compile, of which the validity check 390; 590 to mesh).
- The **twist** costs about 4.5 s in all:
  - make the twisted solid 570, validity check 150, the bore (twisted the same way, then cut) 600, the check and volume again after the cut 270;
  - the op's own checks after it: the body's markers 490, the validity check again plus the self-crossing check 820;
  - the screen's mesh of the 480 curved faces 1440.
- **Fewer arcs** to a flank (2 instead of 4): 4.5 s to 3.0 s; the volume moves by 0.01 per cent.
- **A loft through K turned copies** is not faster: 5.3 s (K=3), 16.8 s (K=5), 6.3 s (K=9), the volume right to 0.1 per cent at K=3.

## After the speed rules (`in_565`; `dec_speed_rules` has the table)
`bench.test.ts` (from `app/`: `node --test ../prototypes/helical-feasibility/bench.test.ts`; `OP=extrude`, `DRAFT=1`, `DETAIL=n`, `Z`, `M`, `BORE` change it) reports the stage times. The twisted 40-tooth gear: 4.8 s before, 1.9 s after.

## A throated wheel as a loft: time (`in_571`)
`loft.test.ts` (env `K`, `Z`, `M`, `TW`) with 30 teeth, module 2, 6 mm bore, 12 mm wide, a 1.9 degree twist and the middle section's tips taken in by a profile shift (the shape of a throat; not the real sections): **3 sections 3.1 s, 5 sections 4.1 s, 9 sections 5.7 s** (the hobbing of one window took 153 s: `prototypes/worm-hobbing`). Accuracy was not measured.
