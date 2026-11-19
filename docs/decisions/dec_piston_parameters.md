---
id: dec_piston_parameters
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1212, in_1215, in_1228, in_1229, in_1233, in_1235, in_1237, in_1239
date: 2026-11-19
depends_on:
  - dec_engine_model: the piston is a part of the engine model; its master numbers (bore, stroke, rod ratio) and the pin limit 0.18 to 0.4 come from there, and a change to how the engine is built changes what the piston must fit
  - q_clearance_profile: every clearance below has an engineered value and a printable one; which the builder makes by default is that question
alternative_to:
---
# The piston's parameter list (a proposal, nothing built)

The human asked for a really good engine builder starting with real pistons (`in_1209`, `in_1212`), a four-stroke single-cylinder gasoline engine first (`in_1215`), able to make **a range of engines** (`in_1228`), and said the home made designs teach little (`in_1229`). `in_1233` asked for this list. **It replaces the piston's proportions that `dec_engine_model` took from memory** (`ch = 0.55 B`, skirt `0.35 B`, groove `0.05 B`, land `0.12 B`) **once the human approves it**; until then the code is unchanged. Every number says where it comes from (`docs/sources/README.md`): **S** = a source read, **D** = my arithmetic from sources, **M** = from memory, no source. B is the bore. Weights: Honda GX160 (OEM data, professional), NACA 817 and 895 (public, real, large 1940s aircraft pistons), Scraba / MAHLE and the Caterpillar patent (professional practice, other bore sizes) count most; the J & E, Chirico and Webster hobby designs count least.

## Built so far (`dec_engine_presets`, `in_1240`)

The tier 1 (Honda) numbers: ring heights, the ring side room, the end gaps, the skirt clearance and the pin fit as `operation/pistondesign.ts`; the ring grooves of the engine model follow the ring height; the Honda GX120, GX160 and GX200 are presets of the engine's box; `test/pistonhonda.test.ts` checks the builder against Honda's published table. **One assumed number was built, A5's skirt below the pin (0.27 B), because the test showed the remembered 0.35 B made the real GX160 impossible.** Everything else below, including the other assumptions A1 to A10, is **still a proposal**.

## How the sources are weighted (a rule, `in_1239`)

The human asked how to reduce the risk of leaning on a 1945 aircraft piston and suggested weighting the Honda data more. **Proposed, with the measurement behind it:**

| Tier | Source | Used for |
|---|---|---|
| 1 | **Honda GX120 / GX160 / GX200 service manual** (OEM data, 60 and 68 mm bores: the size class of the builder's default engine) | every number it gives: pin, pin fit, ring heights, side clearance, end gap, skirt clearance and where it is measured, ring materials, rod and crank fits |
| 2 | Other professional practice: Scraba / MAHLE, Wiseco, Caterpillar patent, EngineLabs / Diamond, ISO 6622, a Springer chapter summary | rules, ranges and the variation axes; each with its own bore size noted |
| 3 | **NACA 817 and 895** (an aircraft piston of 1945, 155.6 mm bore, forged aluminium) | **only** what tiers 1 and 2 do not give, as an *assumption*, and **never as a ratio of the bore for a quantity that does not scale** |
| 4 | the J & E, Chirico and Webster hobby designs | a cross-check only |

**Why quantities must not be scaled from NACA (measured, my arithmetic):** the Honda ring height is the same 1.5 mm in a 60 mm and a 68 mm bore (0.025 and 0.022 B), so ring heights do not follow the bore; NACA's 1.78 mm ring is only 1.2 times Honda's in a bore 2.3 times larger; its clearances are far larger (ring side clearance 0.14 to 0.19 mm against 0.015 to 0.045, skirt clearance 0.6 to 0.7 mm against 0.015 to 0.050, 12 to 46 times). Scaling NACA's land ratio 0.025 B to 68 mm gives 1.7 mm, barely above a 1.5 mm ring. **So: lengths and clearances that are set by the ring, the pin or a fit come from Honda in millimetres; only layout proportions with no other source (a belt stack, where the skirt ends) may come from NACA.**

**Other protections:**

- **Fail-safe side.** Where a number is assumed, the default errs on the side that costs weight or looks, not function: a longer skirt and a taller pin height cost weight; a clearance that is too small seizes, so clearances take the larger Honda value; a crown that is too thin fails, so the crown takes the thicker end.
- **An assumed number never refuses a design.** Only sourced rules and plain geometry (two parts occupying the same space) may refuse (as in `dec_engine_model`); an assumed value is a default the human can override.
- **What matters for a printed engine is fit and motion** (clearances, the pin, the rings, the exact slider crank), which tier 1 decides; the NACA assumptions drive proportions (look) and the heat and strength a printed part never has.
- **A check against the real engine (proposed, not built):** the three Honda engines are presets of the builder (60 x 42, 68 x 45 with its 83.8 to 84.4 mm rod, 68 x 54), and a test compares every default the builder makes for them with Honda's published number (pin, ring heights, side clearance, end gaps, skirt clearance); a default outside Honda's range is changed. This also gives the "range of engines" three real examples. It needs the human's approval (new code and tests), so it is listed under what comes next.
- **Expiry.** Each assumption (A1 to A10) is deleted when a tier 1 or 2 source arrives for it; the section shows what each replaces.

## The master and derived numbers

| Parameter | Proposed rule | Evidence |
|---|---|---|
| Pin diameter | 0.265 B default; 0.18 to 0.4 B allowed (as accepted) | S: Honda's service manual: GX160 and GX200 18.0 mm in 68 mm = 0.265 B, **GX120 13.0 mm in 60 mm = 0.217 B**; a patent for an opposed piston diesel gives 0.3 to 0.45 B (search summary) |
| Pin fit | pin O.D. = pin bore I.D. less 0.002 to 0.014 mm (a floating pin, held by circlips); pin bore 0.002 mm over the pin | S: Honda's service manual (GX120, GX160, GX200: pin 18.0 / bore 18.002 mm, clearance 0.002 to 0.014, limit 0.06 to 0.08); rod small end 18.002 mm too |
| Compression ring height | **1.5 mm for bores 60 to 68 mm (0.022 to 0.025 B)**; 0.95 mm for a thin ring (the "rammer" type); never under 1.0 mm in a printed ring | S: Honda's service manual (top and second rings 1.5 mm on the GX120, GX160 and GX200, the thin ones 0.95 to 0.97 and 0.94 to 0.96 mm; wear limit 1.37 mm); MAHLE packs 1.0 and 1.5 mm; NACA 817 0.0114 B. **The height does not scale with the bore across these engines** |
| Oil ring height | 2.5 mm for 60 to 68 mm bores (0.037 to 0.042 B); never under 2.0 mm | S: Honda's service manual (2.5 mm; wear limit 2.37 mm; a one piece or a three piece oil ring); MAHLE 2.0 and 3.0 mm |
| Ring radial width | 0.045 B (the standard's thicker series D/22) for a cast iron ring; 0.0245 B for a thin steel ring | S: ISO 6622-1 offers cast iron rectangular rings in a regular and a thicker "D/22" radial wall (search summary of the table titles; **the regular value was not seen**); S: NACA 817 thin nitrided steel ring 0.150 in in 6.125 in |
| Ring side clearance | 0.015 to 0.045 mm for the standard ring, 0.035 to 0.080 mm for the thin one; service limit 0.15 mm (engineered) | S: Honda's service manual (top and second 0.015 to 0.045, the thin rings 0.035 to 0.070 and 0.045 to 0.080, oil 0.015 to 0.045); Scraba 0.002 to 0.004 in street, under 0.002 race; NACA 817 0.14 to 0.19 mm (D) |
| Groove depth | ring radial width + back clearance | S: NACA 817; **D:** back clearance 0.3 to 0.4 mm there; Scraba 0.5 mm (race) to 1.0 to 1.3 mm (production) |
| Ring end gap | 0.2 to 0.4 mm for 60 to 68 mm bores (0.003 to 0.007 B); oil ring 0.15 to 0.35 mm; a worn ring is out at 1.0 mm; **gaps spaced 120 degrees apart and never over the pin bore** | S: Honda's service manual (the thin top ring 0.2 to 0.35, the thin second 0.35 to 0.50, its oil ring 0.2 to 0.7) |
| Top land | 0.07 B default, **0.04 to 0.10 B for gasoline** | S: a Springer piston design chapter (search summary only) gives 4 to 10 % of the piston diameter for gasoline engines, shrinking to cut crevice emissions; S: Caterpillar 0.03 to 0.045 B (a 170 mm diesel); Scraba top ring 0.3 to 0.4 in (street) down to 0.06 in (drag) below the deck, **D** 0.075 to 0.10 B on an assumed 4 in bore; NACA 817 not resolved (one reading 0.12 B) |
| Second land | 0.04 B | S: Scraba 0.150 to 0.180 in, **D** on an assumed 4 in bore; an unread MAHLE table summary 0.04 to 0.06 B |
| Lower lands | 0.025 B | S: Scraba 0.070 to 0.125 in, same assumption |
| Crown thickness | 0.08 B, 0.04 to 0.15 B | S: NACA 895 (8 to 30 % of the radius, thin crown runs cooler with oil cooling of the underside, thick with none); unread MAHLE summary 0.055 to 0.10 B |
| Land diameter | smaller than the skirt: diametral clearance to the bore 0.003 B (top land more, 0.2 mm at 70 to 90 mm) | S: Scraba (the skirt takes the thrust, the lands grow hotter); cartecc 0.21 to 0.23 mm; NACA 817 0.0073 to 0.0090 B |
| Skirt clearance (diametral) | **by class**, see below; **measured 10 mm above the foot of the skirt, 90 degrees to the pin bore** | S: Honda's service manual |
| Piston length and skirt below the pin | **assumed** (see A5): length 0.71 B, skirt foot 0.27 B below the pin axis | A: scaled from NACA 817's figure 8; **no small engine source** |
| Compression height (the pin height) | **derived, not a ratio of the bore:** deck height = half the stroke + rod length + pin height, so the pin height is what is left once the stroke, the rod and the deck are fixed; for the builder: the **smallest pin height** that holds the ring pack (top land + rings, grooves and lands + the pin's radius + a boss margin), and then the deck follows; the crown stops 0.9 mm or more under the head (S: 0.035 in with steel rods; the compressed head gasket 0.039 to 0.042 in) | S: EngineLabs / Diamond (read); a longer rod makes the pin height shorter and eventually cuts the oil ring groove (a support rail is the fix); a boosted engine wants the ring pack lower. **A motorcycle catalogue (Wössner, search summary) shows 23.5 and 25.3 mm, about 0.30 to 0.33 B on a 77 to 78 mm bore (mapping unconfirmed): the present 0.55 B (M) is probably too tall** |

**Skirt clearance by class (diametral):** cast aluminium 0.015 to 0.050 mm (0.0002 to 0.0007 B, S: Honda's service manual for the GX120, GX160 and GX200, limit 0.12 mm; the skirt is 59.985 in a 60.0 sleeve and 67.985 in a 68.0 sleeve); forged aluminium 0.05 mm (0.0006 B, S: Wiseco CRF250R, where in the piston it is measured is not stated; the Caterpillar patent 0.0006 B); large forged 0.004 B (S: NACA 817, 1940s); cast iron about 0.13 mm ("five thousandths of an inch", S: Kean, a 1910s text). The skirt is oval (smaller along the pin): cartecc cold clearance 0.2 mm along the pin axis against 0.1 mm across at the top of the skirt, 0.1 against 0.05 mm at the bottom (S, one unnamed engine).

## Assumed design rules from NACA 817 and 895 (**assumptions, to be replaced by a small engine source**)

Nothing read gives a small gasoline piston's length, skirt, groove positions or lands. These rules come from **one** piston: NACA 817's final design (6 1/8 in bore, forged aluminium, an aircraft engine of 1945, four rings), read from its dimensioned figure 8 and expressed as ratios of the bore B, plus NACA 895's thermal study. **Each is an assumption.** The risk common to all: a 1940s aircraft piston is built long and heavy for heat and endurance, so these ratios are probably **conservative (too long, too thick) for a small modern engine**. They keep the builder from producing a piston that cannot work until a better number is found; they are not the right numbers.

| # | Assumed rule | NACA reading | Why it is only an assumption |
|---|---|---|---|
| A1 | **The ring belt is a stack:** top land, then each ring's groove, with a land between rings of **1.5 to 2.0 times the ring height** (floor: 2.3 mm for a 1.5 mm ring) | Lands between rings 0.155, 0.125 and 0.100 in (0.025, 0.020 and 0.016 B) beside grooves of 0.076 and 0.073 in: 2.0, 1.6 and 1.4 times the groove | One piston; Scraba gives 0.04 B and 0.02 to 0.03 B for race pistons on an assumed bore |
| A2 | **Top land 0.07 B** (above; 0.04 to 0.10 B), longer when the crown runs hot. **Taken from the book range, not from NACA** | NACA 817's is 0.755 in = **0.123 B** (shown only as the upper end: the report puts the ring belt "as far from the crown as practicable") | 0.123 B is for an aircraft piston at high output; the book range for gasoline is 0.04 to 0.10 B (a summary only) |
| A3 | **Groove depth = ring radial width + a back clearance of 0.4 to 0.5 mm** | Root diameters 5.749 and 5.715 against land 6.080 in: depth 0.166 and 0.183 in, rings 0.150 and 0.170 in: back clearance 0.39 and 0.32 mm (D) | Scraba gives 0.5 mm (race) to 1.0 to 1.3 mm (production); the rule takes the NACA end |
| A4 | **Pin hole 0.265 B from Honda (13.0 mm in 60 mm is 0.217 B): this row is only a cross-check, NACA is not the source** | The pin hole in figure 8 measures about 1.58 in on a 6.125 in piston = 0.26 B (scaled from the picture, **plus or minus 0.02 B**) | Scaled off a drawing, not a dimension |
| A5 | **The pin height is the stack, built from Honda sizes:** top land + each ring's Honda height (1.5, 1.5 and 2.5 mm) and the lands of A1 + the pin's radius + a margin of 0.05 B: **about 27 mm = 0.40 B for a 68 mm bore** (my arithmetic). **NACA's 0.44 B and 0.71 B piston length are only the ceiling it must stay under**, and the skirt foot 0.27 B below the pin is NACA's alone (the one number with no other source) | The belt is 1.433 in (0.234 B) and the pin axis 2.69 in (0.44 B) below the crown, the foot 4.35 in (0.71 B), all scaled from figure 8 (**plus or minus 0.1 in**); a 3 ring GX160 like stack gives 27 mm (0.40 B) | A motorcycle catalogue (unconfirmed) shows 0.30 to 0.33 B; the NACA piston is long |
| A6 | **Crown thickness 0.08 B** | NACA 895 compares 8 % and 30 % of the radius (0.04 and 0.15 B) | The study is of temperature, not of strength; no gas pressure rule was read |
| A7 | **Skirt oval 0.001 B and a foot 0.0005 B larger than the top** | Skirt 6.098 and 6.092 across and along the pin (0.006 in) and 6.101 at the foot (0.003 in) | Which diameter is which axis was not certain; cartecc's 0.1 mm gives 0.001 B |
| A8 | **Oil drain holes below the oil ring: 0.03 B diameter, four to eight, spaced 30 and 45 degrees from the pin axis** | Eight 3/16 in holes in the oil grooves | The drilling of figure 8 only; a real car piston may use slots |
| A9 | **Edge and groove radii** 0.1 to 0.25 mm in the groove corners; groove sides flat and square to the axis | 0.005 to 0.010 in corner radii, flat sides | The edge radius of a printed part will be larger |
| A10 | **Weight: no rule.** The builder computes it from the geometry and the material's density | none | No source gives a weight in terms of B; stating one would be invention |

**How the builder uses them:** A1 to A3 and A8 place the rings and grooves; A2 and A5 fix the top land and the pin height; A4, A6, A7 and A9 are defaults the human can override; each default carries an "assumed" mark in the model's box (as `dec_engine_model` already marks its remembered proportions) until a source replaces it.

## The variation axes (the "range of engines")

Each is a choice the builder offers, with a source for it, not yet a feature:

- **Ring face:** straight (R), barrel (B) or taper (M, taper angle 10, 30, 60, 90 or 120 minutes), plain cast iron or chrome or molybdenum coated (S: ISO 6622-1, read: the scope, the types and the taper table; its dimension tables are not in the free sample).
- **Ring materials and fit (Honda):** top ring chrome plated, second ring plain, the rings marked TOP and never swapped; an oil ring of one piece or three (a rail and expander); a thin ring set (0.95 mm) on the "rammer" type.
- **Ring pack:** 2 compression + 1 oil (GX160, MAHLE: the usual), 2 compression only (drag racing, the hobby plans), 3 compression + oil (older texts), 2 + 2 above the pin (NACA 817). **Oil ring type:** one piece (GX160 T1, GXV) or three piece with side rails (GX160 T2).
- **Material class:** cast aluminium, forged 2618 aluminium (Wiseco), cast iron (older and hobby); it sets the skirt clearance above and the pin and ring choices.
- **Pin:** hollow or solid, held by circlips (the Wiseco kit), by end plugs (J & E) or by tapered screws (Kean); the pin end stays inside the bore either way.
- **Skirt:** full, or two guide pads of 70 to 90 degrees each with the pin bore inside their height (Caterpillar); oval or round; lightening holes in the lower skirt (Kean).
- **Crown:** flat, domed or dished (Kean); a bowl and valve reliefs are later.
- **Oil:** drain holes below the oil ring (NACA 817 eight 3/16 in on 6.125 in; Scraba).
- **Engine around it:** bore to stroke oversquare (GX160 0.66, CRF250R 0.67) or square, cooling, valve layout, ignition: later stages of `dec_engine_model`.

## What is not known (the honest gaps)

After two rounds of searching and the documents the human supplied (`in_1235` and after):

- **Now sourced (the whole Honda GX120K1 / GX160K1 / GX200 service manual, supplied by the human, read):** the pin and its fit, the ring heights, side clearances and end gaps, the skirt clearance and where it is measured, the rod ends and oil clearance, plus the **rod of the GX160** (the racing class tech procedure page: **3.301 to 3.3225 in between centres** by my arithmetic, ARC's 3.303 in agrees, **rod ratio 0.268**, 140 g). **The T2 spec sheet's 13 mm pin is the GX120's value**: the manual gives the GX160 and GX200 pin as 18.0 mm. **The compression height is derived** from the stack (the row above, from EngineLabs / Diamond).
- **Filled in part, unconfirmed (search summaries):** the standard ring's radial width (the thicker D/22 series; the regular one not seen: the free ISO sample does not include its dimension tables), the gasoline top land (4 to 10 % of the diameter), a motorcycle pin height of about 0.30 to 0.33 B.
- **Still open (assumed from NACA 817 in the section above, A1 to A10):** the piston length, skirt length and weight of a *named* professional small piston, the pin's length and the boss spacing (a patent's bearing area rule is unchecked), the groove depth, the top land of NACA 817. **The Honda service manual gives none of these** (no piston length, pin height, groove depth or weight); the GX160 tech procedure's engine block pages (cylinder, head) are a lead for the compression volume only.
- **I asked for no number to be invented:** where there is no source the table says so.

## Rationale

The accepted engine model took its piston proportions from memory and said so. The human then asked for real pistons, from sources. Three kinds of sources were read: an OEM sheet (GX160), real dimensioned drawings and thermal studies (NACA 817, 895) and trade practice (Scraba, Caterpillar, Wiseco, Kean). A parameter list that carries its source per number lets the builder be checked against them and lets the human see which numbers are thin; the variation axes follow what the sources actually differ on. The proposal is provisional because the human has not reviewed the numbers, and `dec_engine_model` (accepted) is not changed by it.
