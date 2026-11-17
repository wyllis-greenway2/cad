---
id: dec_mechanism_motion
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_803, in_802
date: 2026-11-17
depends_on:
  - dec_standing_mates: a mechanism's joints are the pivots and sliders that decision makes (a coaxial mate leaves a turn and a slide, with stops and a drive step); a change to how joints keep their value changes this
  - dec_hard_bodies: motion is kinematic, as that decision's collision is (no forces); and the exact collision check it uses is too slow per frame, which is why the cycle sweep here is a separate step
  - dec_gear_tool: gears, racks, worms and cams are records that know their numbers, so couplings can be made from them; a change to the record changes the coupling
alternative_to:
---
# Motion in general: joints, couplings and a driver, solved kinematically, drawn on screen and written to nothing

**Drafted at `in_802`, from the proposal after `in_800`; approved at `in_803`** with its five choices (last section). The human asked whether things in the app can move in general (a gear driving other gears or attached parts, a camshaft driving a piston).

- **A mechanism is joints, couplings and a driver.**
  - **Joints** are what the project already has: the pivots and sliders of coaxial mates, each with a value (a turn in degrees, a slide in mm) and stops (`dec_standing_mates`).
  - **Couplings** tie the value of one joint to another's (or to a body's pose). Each is a small function: **gear pair** (ratio of the teeth, opposite hand; the ring: same hand), **rack and pinion** (slide = pitch radius x turn), **belt or chain** (ratio, same hand), **screw** (slide = lead x turn / 2 pi), the **Geneva** and the **ratchet** (the rules already worked out and tested: the wheel's turn while the pin is in the slot; one way only), **cam and follower** (below). The generators make them: Mesh gear knows both tooth counts; a cam record offers "drive a follower"; a Geneva model comes with its wheel-to-crank rule.
  - **A driver** is a joint marked as driven: a steady speed, a swing between stops, or a value set by a scrubber. Everything coupled to it follows. A chain of couplings is worked out forward from the driver in one pass each tick. A **loop** (a four-bar, a slider-crank) has no forward order and goes to the pose solver the project already has for mates (`solveDriven`, `operation/matesolve.ts`), small and numerical.
- **Cam and follower is a contact coupling**, in the cam's plane: the follower slides along its axis (or swings about a pivot) to the place where it just touches the cam's outline at the cam's angle. For the disc cam the outline is the record's own curve and the lift is the law it was made with; a table of follower position against angle is made once per record (and when its numbers change) and looked up each tick. A roller follower is the follower's circle.
- **Kinematic only.** No forces, gravity, springs, friction, backlash or flex: the same line as `dec_hard_bodies`. A part moves because its joint's value says so.
- **The pose is temporary, and nothing is written.** Play and the scrubber move the **pictures** of the bodies on screen by one matrix each, as dragging a body does now; they make no step, no kernel run, no history entry. Stop puts every joint back to its rest value (what the history says). A **keep this pose** action writes the pose as the ordinary drive steps joints already use (`driveCommand`), one undo.
- **Drawn on screen by a matrix for each moving body** (measured, `prototypes/mechanism-play`, `in_801`): matrices cost under 0.1 ms a frame for 150 bodies; what the frame rate follows is the triangle count, the same as the still model; making new geometry each frame is the thing to avoid (about five times the render call). So the viewer, which now moves **one group with one matrix** (`bodyMatrix`, `bodySplit`), is to keep **one mesh per body** (split once when the kernel answers, from its face ranges) and take **a list of matrices** from the frame.
- **Collision is not part of a tick.** The exact check is a kernel boolean, far too slow per frame. During play at most boxes are compared (and a body that is hard and meets another stops at its last free pose, as in a drag). A **sweep of the whole cycle** is a separate action, run once, that steps the driver through its range and reports where hard bodies meet, with the angle: a clearance check for printing, run off the main thread.
- **Saved.** Drivers and couplings are saved in the file (as relations are), so a mechanism opens as it was left; the pose is not.
- **Built in stages**, each worth having alone:
  1. **Play and scrub for a joint that exists** (a pivot or a slider), no couplings; the per-body matrices in the viewer.
  2. **Gear ratio couplings**: from Mesh gear, rack and pinion, belts, a screw; so one driven gear turns the gears and the parts attached to them (parts mated to a gear's shaft follow it as a body).
  3. **Cam and follower contact, the Geneva and the ratchet** as couplings.
  4. **Loops** through the pose solver, and **the cycle sweep**.
- **Not in this entry:** forces and dynamics of any kind; a motor's torque or a load; flexible parts (the printed spring pawl); measuring speed or acceleration of a point (a later report).

## The five choices (approved at `in_803`)

1. **The pose is view only** (nothing written until **keep this pose**), not a committed motion.
2. **Kinematic only**: no forces, springs or gravity.
3. **Drivers and couplings are saved in the file**; the pose is not.
4. **The first slice is stages 1 and 2**: play and scrub for a joint, and gear ratio couplings (so a gear drives gears and attached parts).
5. **Couplings are made by the generators** (Mesh gear and the others offer them), with a way to make one by hand between two joints and a ratio.

## Rationale

Every part of this exists in some form already: joints with values and stops, a pose solver for loops, collision that stops a body, records that know their numbers, and a way to move a body's picture without the kernel. What is missing is the **tie between joints**, **time**, and **one matrix for each body**; keeping the pose off the history keeps motion cheap (measured) and keeps the model what it was. Kinematic only keeps the scope the size of the existing collision decision, and nearly everything a person prints and wants to see move (gear trains, cams, Geneva and ratchet drives, linkages) is kinematic.
