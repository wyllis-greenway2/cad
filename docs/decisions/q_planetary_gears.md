---
id: q_planetary_gears
kind: question
status: open
origin: ai-unreviewed
human_input: in_736
date: 2026-11-17
depends_on:
  - dec_gear_tool: a planetary set is sun, planets and ring made as gear records and meshed with Mesh gear and Mesh ring; a change to how gears are records changes it
alternative_to:
---
# Planetary gear maker: what the rules are, and what to build

**Asked (`in_736`):** look up how planetary gears work and help build a planetary gear maker. Nothing is built; this records what was found and what to decide.

**What exists already (`dec_gear_tool`):** the sun (outside gear), the ring (`Ring gear`) and a gear meshed in a ring (`Mesh gear`) or a ring round a gear (`Mesh ring`). A planetary helper was listed there as "later". What is missing is one command that makes the whole set, with the planets placed and the numbers checked.

**The rules (web search, standard mode; sources below are a mix of good and weak, to be checked against a textbook or AGMA before they are relied on):**
- Same module and pressure angle on all gears. Tooth counts: `Zr = Zs + 2 Zp` (ring = sun + two planets), so the planets sit on a circle of radius `m (Zs + Zp) / 2`.
- **Equal spacing assembly condition:** `(Zs + Zr) / N` must be a whole number for `N` planets spaced `360/N` apart, all in the same phase. (A sequential, out of phase design can space them evenly otherwise: AGMA paper; unequal spacing also works.) Eng-tips and Glinsky's notebook agree on the integer test.
- **Planets must not touch each other:** the tip circles of neighbouring planets need clearance: `2 (Zs + Zp) m/2 sin(180/N) > tip diameter of a planet`.
- **Ratio (Willis):** `(ns - nc) / (nr - nc) = -Zr / Zs`. Ring held, sun in, carrier out: `1 + Zr/Zs` (reduction). Carrier held: `-Zr/Zs`. Sun held, ring in, carrier out: `1 + Zs/Zr` (a smaller reduction). Sources write some of these as the reciprocal: check the convention.
- Not found: anything specific to 3D printing (clearances, helical or herringbone planets are the usual choice). `prin_manufacture_agnostic` already says nothing per route.

**To decide (the human):**
1. Inputs: sun teeth, planet teeth (ring follows), number of planets, module; or desired ratio and the tool picks counts that meet the assembly rule?
2. What it makes: the three gears as separate bodies plus the carrier (a plate with pins at the planet circle), or only the gears?
3. Is it a new feature that keeps its numbers (like a gear record, so editing the teeth moves the planets) or a one-shot layout that places ordinary gears?
4. Spur only first, or helical too (`dec_gear_tool` has helical gears and Mesh gear gives the opposite hand)?
5. Show the ratio for each hold (ring, carrier or sun fixed) in the box?

**Plan if approved:** a prototype first under `prototypes/` (free), then a provisional `dec_` entry and the code in `app/` only after approval (`CLAUDE.md` rule 9).

**Sources:** industrialmonitordirect.com (weak, repeated text); eng-tips thread 357212; Glinsky, drivetrainhub notebooks-gears "Chapter 4 - Planetary Gears"; AGMA "Epicyclic gearboxes" (Aug 2021); tec-science planetary pages; woodgears.ca planetary ratio page; tspi.at planetary calculator.

## Rationale

The existing tool already makes every gear of a planetary set; the value of a maker is the checks (assembly condition, planet clearance) and the placement, which are cheap to get wrong by hand. The rules are recorded here and left open because the form (feature or layout) changes what is built.
