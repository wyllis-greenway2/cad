---
id: dec_piston_parameters
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1212, in_1215, in_1228, in_1229, in_1233
date: 2026-11-19
depends_on:
  - dec_engine_model: the piston is a part of the engine model; its master numbers (bore, stroke, rod ratio) and the pin limit 0.18 to 0.4 come from there, and a change to how the engine is built changes what the piston must fit
  - q_clearance_profile: every clearance below has an engineered value and a printable one; which the builder makes by default is that question
alternative_to:
---
# The piston's parameter list (a proposal, nothing built)

The human asked for a really good engine builder starting with real pistons (`in_1209`, `in_1212`), a four-stroke single-cylinder gasoline engine first (`in_1215`), able to make **a range of engines** (`in_1228`), and said the home made designs teach little (`in_1229`). `in_1233` asked for this list. **It replaces the piston's proportions that `dec_engine_model` took from memory** (`ch = 0.55 B`, skirt `0.35 B`, groove `0.05 B`, land `0.12 B`) **once the human approves it**; until then the code is unchanged. Every number says where it comes from (`docs/sources/README.md`): **S** = a source read, **D** = my arithmetic from sources, **M** = from memory, no source. B is the bore. Weights: Honda GX160 (OEM data, professional), NACA 817 and 895 (public, real, large 1940s aircraft pistons), Scraba / MAHLE and the Caterpillar patent (professional practice, other bore sizes) count most; the J & E, Chirico and Webster hobby designs count least.

## The master and derived numbers

| Parameter | Proposed rule | Evidence |
|---|---|---|
| Pin diameter | 0.265 B default; 0.18 to 0.4 B allowed (as accepted) | S: GX160 18 mm in 68 mm = 0.265 B |
| Compression ring height | 0.022 B, never under 1.0 mm | S: GX160 1.5 mm = 0.022 B; MAHLE packs 1.0 and 1.5 mm; NACA 817 0.0114 B |
| Oil ring height | 0.037 B, never under 2.0 mm | S: GX160 2.5 mm; MAHLE 2.0 and 3.0 mm |
| Ring radial width | 0.0245 B | S: NACA 817 0.150 in in 6.125 in; **no small engine source** |
| Ring side clearance | 0.05 to 0.10 mm (engineered) | S: GX160 0.015 to 0.095 mm; Scraba 0.002 to 0.004 in street, under 0.002 race; NACA 817 0.14 to 0.19 mm (D) |
| Groove depth | ring radial width + back clearance | S: NACA 817; **D:** back clearance 0.3 to 0.4 mm there; Scraba 0.5 mm (race) to 1.0 to 1.3 mm (production) |
| Ring end gap | 0.004 B (0.003 to 0.006) | **D** from S: GX160 0.20 to 0.40 mm in 68 mm |
| Top land | 0.08 B default, 0.03 to 0.12 B | S: Caterpillar 0.03 to 0.045 B (a 170 mm diesel); Scraba top ring 0.3 to 0.4 in (street) down to 0.06 in (drag) below the deck, **D** 0.075 to 0.10 B on an assumed 4 in bore; NACA 817 not resolved (one reading 0.12 B) |
| Second land | 0.04 B | S: Scraba 0.150 to 0.180 in, **D** on an assumed 4 in bore; an unread MAHLE table summary 0.04 to 0.06 B |
| Lower lands | 0.025 B | S: Scraba 0.070 to 0.125 in, same assumption |
| Crown thickness | 0.08 B, 0.04 to 0.15 B | S: NACA 895 (8 to 30 % of the radius, thin crown runs cooler with oil cooling of the underside, thick with none); unread MAHLE summary 0.055 to 0.10 B |
| Land diameter | smaller than the skirt: diametral clearance to the bore 0.003 B (top land more, 0.2 mm at 70 to 90 mm) | S: Scraba (the skirt takes the thrust, the lands grow hotter); cartecc 0.21 to 0.23 mm; NACA 817 0.0073 to 0.0090 B |
| Skirt clearance (diametral) | **by class**, see below | S/D |
| Skirt length | 0.49 B from crown to foot at most | D: NACA 817 3 in of 6.125; **no small single source** |
| Compression height | **at least the stack:** top land + rings, grooves and lands + the pin's radius + a boss margin; the larger of that and the proportion | S: a textbook summary says the ring count, lands, pin and top land set a minimum; **no professional small piston gives the number**; the present 0.55 B is M |

**Skirt clearance by class (diametral):** cast aluminium 0.015 mm (0.0002 B, S: GX160); forged aluminium 0.05 mm (0.0006 B, S: Wiseco CRF250R, where in the piston it is measured is not stated; the Caterpillar patent 0.0006 B); large forged 0.004 B (S: NACA 817, 1940s); cast iron about 0.13 mm ("five thousandths of an inch", S: Kean, a 1910s text). The skirt is oval (smaller along the pin): cartecc cold clearance 0.2 mm along the pin axis against 0.1 mm across at the top of the skirt, 0.1 against 0.05 mm at the bottom (S, one unnamed engine).

## The variation axes (the "range of engines")

Each is a choice the builder offers, with a source for it, not yet a feature:

- **Ring pack:** 2 compression + 1 oil (GX160, MAHLE: the usual), 2 compression only (drag racing, the hobby plans), 3 compression + oil (older texts), 2 + 2 above the pin (NACA 817). **Oil ring type:** one piece (GX160 T1, GXV) or three piece with side rails (GX160 T2).
- **Material class:** cast aluminium, forged 2618 aluminium (Wiseco), cast iron (older and hobby); it sets the skirt clearance above and the pin and ring choices.
- **Pin:** hollow or solid, held by circlips (the Wiseco kit), by end plugs (J & E) or by tapered screws (Kean); the pin end stays inside the bore either way.
- **Skirt:** full, or two guide pads of 70 to 90 degrees each with the pin bore inside their height (Caterpillar); oval or round; lightening holes in the lower skirt (Kean).
- **Crown:** flat, domed or dished (Kean); a bowl and valve reliefs are later.
- **Oil:** drain holes below the oil ring (NACA 817 eight 3/16 in on 6.125 in; Scraba).
- **Engine around it:** bore to stroke oversquare (GX160 0.66, CRF250R 0.67) or square, cooling, valve layout, ignition: later stages of `dec_engine_model`.

## What is not known (the honest gaps)

Compression height and piston length of a professional small piston; the oil ring's radial width and the groove depth of a car or motorcycle piston; the pin's length and the boss spacing; the weight; whether 0.265 B for the pin holds across makers (one engine); the top land of NACA 817. **I asked for no number to be invented: where there is no source the table says so.** The rod ratio is not a piston number and is left to `dec_engine_model` (its 0.2 to 0.5 limit has no professional evidence either way: the GX160 sheets give no rod length).

## Rationale

The accepted engine model took its piston proportions from memory and said so. The human then asked for real pistons, from sources. Three kinds of sources were read: an OEM sheet (GX160), real dimensioned drawings and thermal studies (NACA 817, 895) and trade practice (Scraba, Caterpillar, Wiseco, Kean). A parameter list that carries its source per number lets the builder be checked against them and lets the human see which numbers are thin; the variation axes follow what the sources actually differ on. The proposal is provisional because the human has not reviewed the numbers, and `dec_engine_model` (accepted) is not changed by it.
