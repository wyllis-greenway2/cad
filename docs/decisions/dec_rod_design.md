---
id: dec_rod_design
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1250
date: 2026-11-19
depends_on:
  - dec_engine_model: the rod is a part of the engine and keeps its length, eyes and motion (the slider crank); a change to how the rod moves changes the cap's follower
  - dec_clearance_defaults: the rod's room on the pins is the typed `room`; the crank pin is Honda's fit by the pin's rule
  - prin_manufacture_agnostic: a split big end and an I-beam are shapes of a rod, not a way of making it
alternative_to:
---
# The connecting rod: an I-beam, and a big end split into rod and cap with two bolt holes

The human chose the connecting rod as the next part (`in_1250`). What the sources give is little (Honda: the eyes' sizes 18.002 and 30.02 mm, the length 83.8 to 84.4 mm, 140 g, bolt torque 12 N m for a GX160; Kean: I-section rods, a removable cap on the crank end, a bored beam): **every shape number below is ASSUMED**, and marked so in the code and the engine's box.

- **The beam is an I-section:** a pocket cut into each flat face of the beam, between the eyes, leaving a web of **0.3 of the rod's thickness** in the middle and flanges at the edges **0.3 of the small end's half width** wide (at least 0.8 mm).
- **The big end is split** at the crank pin's centre, across the rod: the half toward the crank is a **separate body, the Rod cap**, the other half is the rod's. Each half has a lug either side, and a **bolt hole** along the rod's axis through both lugs (bolt diameter 0.09 of the bore, at least 2 mm, lugs 1.5 bolt diameters long). The bolts themselves are not modelled.
- **The cap is glued to the rod** in Play: it goes with it.
- **Not built:** bearing shells, oil grooves and the small end's bush, a rod's weight (the Measure tool works it out), and the cap's and the rod's mating faces (serrations).
- **Seven bodies** now (the cap is new).
- **The two halves stand half the typed `room` either side of the crank pin's middle** (so the cap is a body of its own: the kernel returned an invalid solid when the two bodies shared a face, so they are given the room instead).
- **Measured:** the GX160 preset's rod and cap are 12.5 cm3 together (9.9 and 2.6): 34 g in aluminium, 98 g in steel, against Honda's 140 g with its bolts: the model's rod is slimmer than the real one (its thickness, 0.75 of the pin, and the beam's width are the model's old proportions, not Honda's). **Not changed**: no source gives the rod's thickness.

## Rationale

The human chose the rod. A rod that is two eyes and a flat bar is not a connecting rod; the I-beam and the cap are the two things every rod in the sources has. The shapes are assumptions because no source gives their sizes, and are marked so.
