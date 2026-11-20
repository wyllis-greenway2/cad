---
id: dec_piston_lands_clips
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1259
date: 2026-11-20
depends_on:
  - dec_piston_maker: these are two of its N variables (land relief, circlip retention) made typed fields, 0 = auto
  - dec_piston_belt: the lands are the ring belt's lands
  - dec_piston_hollow: the circlip grooves are cut in the pin bore through the bosses and the walls
alternative_to:
---
# Relieved ring lands, and circlip grooves with the circlips

The human approved (`in_1259`). Built, **assumed** except where a source says so:

- **Land relief.** The lands (the top land and the lands between ring grooves; not the skirt below the last groove) are cut smaller than the skirt: the top land by **0.003 of the bore** across and the others by **0.002 of the bore**, two typed numbers (mm across, 0 = auto). **Sources:** Scraba (the lands are smaller than the skirt, which takes the side load, and the lands run hotter), cartecc (a heat land 0.21 mm to the bore against the skirt's 0.1 to 0.2), NACA 817 (lands 0.015 to 0.022 in under the skirt on a 6.1 in piston); **the proportions are assumed**, no small engine gives them. A land must stay above the groove floors (refused if not).
- **Circlip retention.** A typed **Pin retention** (0 none, 1 circlips; default 1: Honda holds the pin with circlips): a groove in the pin bore near each outer face, and a **circlip body** in each ("Circlip 1", "Circlip 2": a plain ring with no gap; the engine glues them to the piston). The pin is shorter by the grooves: it ends the **pin end float** (0.1 mm) short of the circlip. Typed fields (0 = auto): groove width (0.06 of the pin, at least 0.8 mm), groove depth (0.028 of the pin, at least 0.4 mm), the groove's distance from the outer face (1.0 mm), and the pin's end float. **All assumed:** the circlip sizes come from memory of the DIN standard for internal circlips (about 1.1 mm wide and 0.5 mm deep for an 18 mm pin), **not read in a source** (the standard is paid); the Wiseco page only says the kit has circlips. The circlip ring has a small room (0.05 mm) in its groove (the kernel does not accept two bodies sharing a face).
- **The engine** gets both (retention on by default, so **nine bodies**), the Piston model too; both by the same code.
- **Not built:** a circlip's gap and ears, the other retentions (plugs, press fit, screws), skirt shape, crown.

## Rationale

The human chose them. A land narrower than the skirt and a pin held by circlips are two of the things a real Honda piston has that this one lacked. The land relief is sourced in kind (not in size); the circlip sizes are not sourced at all and are marked so.
