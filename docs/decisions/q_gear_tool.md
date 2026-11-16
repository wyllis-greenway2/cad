---
id: q_gear_tool
kind: question
status: open
origin: ai-unreviewed
human_input: in_543
date: 2026-11-16
depends_on:
alternative_to:
---
# A gear tool: what to build first, and how it should work

**Asked (`in_543`):** whether a gear tool is feasible, which tooth profiles, which inputs (tooth count, ratio, diameter, thickness), whether belt pulleys, chain sprockets and laser-cut (clock, wood) gears belong in it, which gear types come later (planetary, bevel, helical, differential), whether an existing library should be loaded instead, and whether the teeth can be the real profiles of machined gears. Nothing is built; the points below are the AI's proposal, for the human to answer.

**Proposal.**
- **Feasible.** A tooth profile is closed-form maths (the involute, the cycloid, tables of dimensions for belts and chains). The tool computes one tooth, repeats it round the axis and hands the kernel a closed outline plus the bore. Everything else (hub, spokes, keyway, lightening holes) is the normal tools on that outline.
- **One generator, many profiles.** A profile generator gives one pitch of outline from a few numbers; the tool does the circular repeat, bore, thickness and the editing of the numbers later. New profiles are new generators, not new tools.
- **Inputs, in the way a maker thinks:** tooth count and module (the tooth size, metric; diametral pitch offered as the inch way) are the real parameters; the pitch diameter is module times teeth and is shown, and "outside diameter" can be typed instead (it solves the module). Also pressure angle (20 degrees by default), thickness, bore, profile shift, backlash. For a pair: both tooth counts or a ratio, with the centre distance shown; a gear mate that ties the two turns by the ratio comes after.
- **First set:** involute spur gear (external), internal (ring) gear, rack; the standard 20 degree tooth with a root fillet and undercut avoided by profile shift; clearance and backlash set for printing (looser) or cutting. Then: laser-cut presets (kerf allowance; cycloidal clock teeth; flat 2D export already exists, `dec_export_flat`); timing pulleys and sprockets from published tables (GT2, HTD, MXL, T5; ISO 606 roller chain such as bicycle chain), which are not gears but the same generator form; helical and herringbone gears by twisting the same outline (`dec_spiral_extrude`).
- **Later and different in kind:** bevel (right angle) gears and worms need tooth shapes on cones or screws; planetary sets are a layout helper over spur gears (the ring has the sun plus twice the planet's teeth, planets must space evenly: sun plus ring teeth divisible by the planet count), not a new tooth; a differential is an assembly, not a tool.
- **Library:** not loaded; the usual gear libraries are GPL or LGPL (the project takes no GPL), and the maths is public (ISO 53 and DIN 867), so it is written here. Vendor STEP files already come in through Import.
- **Real profiles:** the involute is the one real machined profile (constant speed ratio, forgiving of small centre error); low friction and wear after that is profile shift, tip relief and crowning, which are later options. Not claimed: that a printed or cut gear reaches a hardened gear's life.

**Open:** order of the profiles; whether the tool makes a flat figure first (so it can be cut or extruded) or goes straight to a body; whether sketches can carry the involute as a curve or only as many short lines and arcs (to be learned in a prototype under `prototypes/` before any production code, rule 9).

## Rationale

Nothing depends on this yet. Kept open because the human has not chosen the first profiles or the shape of the tool.
