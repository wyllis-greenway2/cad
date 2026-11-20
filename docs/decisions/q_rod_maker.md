---
id: q_rod_maker
kind: question
status: open
origin: ai-unreviewed
human_input: in_1280, in_1281
date: 2026-11-20
depends_on:
  - dec_rod_design: this entry grows that entry's rod (I-beam, split big end, two bolt holes) into a maker with its own box; its shapes are the starting point
  - dec_piston_maker: the rod's small end must meet the piston maker's pin, boss gap and room; the rod maker is built on the same pattern (a model kind with grouped, typed fields, 0 = auto, presets)
  - dec_engine_model: the engine builds its rod by the same code, so the two cannot differ
alternative_to:
---
# A connecting rod maker: a cast rod with a bolted cap, bearing shells and a small end bush, whose ends fit the piston maker's pin and the crank pin

The human (`in_1280`) wants a **rod maker**, in the way the piston maker is a maker (a model of its own in *Models*, with every variable of the rod in a box of grouped numbers, real engines as presets), so that the rod and the piston make one assembly, and a rod "that really could work in a real engine, with all the features and details of a real arm". This entry is the design asked for approval. **Nothing is built.**

## What the piston maker does (read, and what the rod maker takes from it)
A model kind (`modelkinds.ts` entry, `modelpiston.ts` builds it, a `Builder` makes steps and bodies), numbers in groups that fold, **0 = auto** (a rule works it out; a number typed is never moved), a *Start from* preset row, about text with weight and what is assumed, a blue wireframe preview, and **the engine builds its piston by the same code**. The rod maker follows all of that. Its inputs from the piston: the pin's diameter, the pin's room, the room between the bosses (the rod's small end width is that less the room each side), the retention (circlips: the small end needs no more room than the bosses give).

## What the rod has today (`dec_rod_design`, all shapes assumed)
Small eye (a plain hole on the pin, room typed), a tapering beam with a pocket in each face (an I-section), the big end split at the crank pin's middle into rod and cap (two bodies) with two lugs and two bolt holes along the rod. **Missing:** everything below.

## Proposed variables, in groups (T = typed field, 0 = auto)
1. **Size.** Length centre to centre (from the engine's stroke and rod ratio, or typed), small end bore (the pin), big end bore (the crank pin, plus two shell walls), thickness at the big end and at the small end (they differ in a real rod), the rod's weight (outputs: weight by material, and the reciprocating and rotating parts of it, split by the usual two thirds / one third rule: **from memory**).
2. **Small end.** Outer radius or wall, a **bush** (none, or a press fit sleeve with wall 0.05 of the pin, at least 1 mm, and an oil hole at the top), the pin's room in the bush (Honda: 0.002 to 0.014), a **clamp** type: *floating* (bush, circlips in the piston), or *clamped* (a slot and a **clamp bolt** across the small eye, as in the second picture's "clamping bolt", washer and locking plate), an oil hole or a squirt slot at the top.
3. **Beam.** Section: I-beam (default), H-beam, a plain rectangle; web thickness, flange width and thickness, the **taper** (narrower at the small end), **generous blend radii** where the beam joins the eyes (a shape, not a process; a typed number), a rib or a lightening hole; an **oil drilling** along the beam (small end to big end, N).
4. **Big end.** Split angle (straight across, or at an angle for a big pin), the lugs' size, **the bolt**: metric size from the fasteners table already in the repo (M6, M8: socket head and nut, `fasteners.ts`), bolt count 2, the bolt's centre distance from the bore, **the cap's thickness**, a nut seat (a spot face) or a threaded hole in the rod, dowels or the machined **mating faces** (steps, serrations) that locate a cap, the torque (Honda 12 N m for a GX160, **sourced**), the **bearing shell**: wall thickness (assumed from the bore), width, **crush** (the shell stands proud of the split by a little, N), a locating tab and notch, an oil groove and a hole, the **big end's side clearance** (Honda 0.1 to 0.7 mm, **sourced**) and the oil clearance (Honda 0.040 to 0.063, **sourced**; the web search gives about 0.001 per inch of journal, **unverified**).
5. **No manufacturing features in the rod tool** (`in_1281`): draft, machining allowance, parting line, balance pads, cutter radius and the like are **not** variables of the rod. They belong to separate manufacturing-route modules (casting, machining, printing) that act on any body, including the rod, later (`prin_manufacture_agnostic`). The rod tool states the *functional* shape only; where a function needs a number that looks like a process one (a blend radius to avoid stress, a bore finished to size), it is typed as the function.
6. **Bodies built:** Rod, Cap, two Bolts, two Nuts (or none), the Bearing shell halves (two), the Small end bush, the clamp bolt: about nine, glued as the cap is today.

**Presets:** Honda GX120, GX160 (rod: big end 30.02, small end 18.005, length 83.8 to 84.4, weight with bolts 140 g, bolt torque 12 N m: all **sourced**) and GX200. The rod's shapes between the eyes have **no source**, so they stay assumed and marked.

## What is sourced and what is not
Sourced in the repo: Honda's eyes, length, weight, clearances and torque; Kean (qualitative). **Searched today, summaries only, little found** (`docs/sources/README.md`): the web gave I-beam versus H-beam in words, the bearing oil clearance of about 0.001 per inch of journal and a shell overlay thickness (aftermarket makers and forums, **unreliable**), a small end bush clearance of 0.00075 to 0.0017 in (a military service manual's summary) and no standard for bush walls, bolt sizes or bearing width ratios. **The standards for shell bearings (ISO 3548, ISO 12301, SAE J1228?) and for rod proportions are not read and are mostly paid.** So most proportions would be assumed, as the piston's were, and said so in the box.

## Research on bearings (`in_1281`; search summaries only: **no page could be opened**, the session's network does not resolve Wikipedia, EngineLabs, Cycle World or FordMuscle; forums and aftermarket makers, so treat as informal)
- **Big end, four-stroke cars and most singles:** a **plain bearing in two half shells** (steel back with a soft lining: bi-metal, steel and aluminium; or tri-metal, copper-lead and an overlay), in the rod and cap bore, **fixed to the housing** (the shell does not turn; the crank pin turns inside it). Held by **crush** (each shell stands proud of the split by a little, so tightening the cap grips it in the bore) and located by a small **tab**, which only aligns it at assembly and does not stop it spinning. Oil comes through a hole and groove in the shell. Search figures: oil clearance about 0.001 in per inch of journal (ACL 0.00075 to 0.001 plus 0.0005); Honda GX160's 0.040 to 0.063 mm is in the repo.
- **Small end:** a **one-piece sleeve (a bush, usually bronze)** **pressed into the rod's eye**, reamed to the pin after pressing; the pin turns in it. Fully floating pins (circlips, as Honda's) turn in the bush and in the piston; semi-floating pins are fixed in one part (clamped in the rod, or pressed in the piston) and turn in the other. A rod with no bush (the pin on the bare eye) is common in small cheap engines (aluminium rod).
- **Rolling bearings:** yes. **Two-strokes** commonly use **caged needle rollers** at the big end and often the small end (hot, little oil); a needle cage needs a one-piece rod and a **built-up (pressed together) crank**, since the rod cannot be split to go on. Some four-strokes do (the Rotax 912's rod has rolling big end, a 1995 SAE paper covers rolling big ends in small motorcycle singles). **Ball bearings** at the rod are rare (they are used on crank mains, not rods), and forums call them less durable.
- **Not found:** the shell's wall by journal size, its width ratio, the crush height, the tab's size, the bush's wall, and the bolt's size: **no number**.

## Questions for the human
0. **Bearings (new).** Proposed: the rod's **big end bearing type** is a typed choice: *Plain shells* (two shells, the default), *Needle rollers* (a one-piece rod, a cage and rollers, with the crank pin a separate round pin; the cap is dropped), or *None* (a bare bore). The small end the same: *Bush* (a sleeve), *Needle*, *None*. Is that the right set?
1. **Scope of the first slice.** Suggested: the rod and cap as the engine has them, now with a typed **bearing shell** (two shells), a **small end bush**, a real **bolt** (a body each, from the fasteners table), the beam section choice and fillets and draft, and the Honda presets; then the clamped small end and the oil drilling after.
2. **Sources.** Can you upload a page or two: a rod's drawing with dimensions (a service or a hobby engine's: Honda's rod drawing is not in the manual), a bearing shell table (any maker's: the wall thickness for a given bore, the width, the crush, the tab), or a book page on rod proportions (Machinery's Handbook, Kean)? Without them the proportions are assumed.
3. **Where it lives.** A model of its own (*Models > Connecting rod*, standing, small end up), and the engine builds its rod by the same code (as for the piston). Is that right?
4. **Fit with the piston maker.** The rod takes the pin, the boss gap and the retention from the piston's numbers; in the Rod model alone those three are typed in the Rod's box. Is that enough, or should the two be one model, *Piston and rod*, to start?

## Rationale
The human asked for a rod maker that works with the piston maker and has the details of a real rod. The piston maker's pattern (one code for the maker and the engine, typed numbers with an auto rule, presets only from a source) keeps the two from disagreeing, and the engine's rod is already there to grow. The list is proposed, not approved: most rod proportions have no source in the repo, so each is marked assumed until the human gives a better one.
