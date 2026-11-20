---
id: dec_keyway_maker
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1267, in_1268
date: 2026-11-20
depends_on:
  - dec_gear_tool: the gear's bore, flat and keyway (`bore.ts`) would move out of it into the new tool
  - dec_hub_spoke: the Wheel and Cut spokes carry the same three bore numbers (`in_1259`), to be taken out the same way
alternative_to:
---
# The keyway maker: keys, flats and splines, apart from the gear and the wheel

**Asked (`in_1267`):** offer splined shafts and bores, with real spline tooth profiles (gear-shaft splines and flutes, not drafting splines); take the bore maker out of the gear maker and the wheel maker (which would then make smooth round holes only) into a tool of its own, probably called the keyway maker, that keys shafts to holes with **keys, flats and splines**; keys and flats user defined but with catalogue choices of standard sizes that can be bought; the spline profile chosen from the standards as a gear's teeth are.

**Approved (`in_1268`: "Approve the design, and I'll upload the standards tables as files"); the design (nothing built yet):**
1. **One tool, on a round hole or a round shaft** that is selected (as Cut spokes reads a round body: `roundbody.ts`): it cuts the keyed shape into a hole, or builds the matching shaft end (the male side), with the same numbers for both so a shaft and a hole made from one entry fit. Kinds: key (a keyway, and the key as its own body), D flat, double flat, spline.
2. **The gear, the wheel and Cut spokes keep Bore diameter only** (a round hole); Bore flat, Key width and Key depth leave their boxes. A gear or wheel with a keyed bore is a gear or wheel and then the keyway maker on its bore. Saved projects with a gear that has a flat or key (`GearSpec.flat`, `key`, `keyDepth`) must keep working: they would be read as the gear plus a keyway step (a migration to design before building).
3. **Catalogues** by standard, chosen as the gears' teeth are: keys by shaft diameter (DIN 6885 / ISO 773 widths and depths, ANSI B17.1 square and rectangular, Woodruff), splines by designation (straight-sided 6/10/16-spline of the SAE series, ISO 14 light and medium series, an involute family of ISO 4156 / ANSI B92.1), plus "own numbers".
4. **The first slice** would be what can be sourced and verified: the keys already in `bore.ts` (DIN 6885 by bore, 6 to 38 mm: `standardKey`) and flats, then one straight-sided spline series, then an involute spline (formula driven, so it needs no table).

**What is known about the data (a search, 2026-11-20, `docs/sources/README.md`):** nothing is verified yet. The session cannot read the sites that carry the tables (engineersedge.com, fasten.it, bd-warehouse docs: host not allowed in the session's network), so the search gave only snippets: DIN 6885 rows for 2 to 8 mm and 12 to 30 mm from one hobby calculator page (not authoritative), the ISO 14 designation form N x d x D (6x23x26 and 6x26x30 light, 6x23x28 medium) from sample pages, and the fits (shaft keyway N9, hub keyway JS9, key h9). **No SAE 6/10/16 fractions, no ANSI B17.1, Woodruff, ISO 4156, DIN 5480, B92.1 formula or table was obtained, and none is to be guessed.** Standards are sold (DIN, ISO, SAE, ANSI); facts such as dimensions and formulas are not copyrightable but wholesale copies of a standard's tables may be a concern: derive from formulas where there are any and cite the standard by number (the human's call).

**Status:** (a) the design is approved (`in_1268`); (b) the data is not here yet: the human will upload the tables as files (the list of files asked for is in the handoff); nothing is encoded until they are read; (c) was asked and is not yet answered, so the gear's and the wheel's flat and keyway stay as they are until the new tool exists. Earlier wording of what was needed: either allow the hosts of the sources (the session's network settings) or send the tables as files (as was done for the gear standards): DIN 6885-1, ISO 14, an SAE 6/10/16 spline table or formulas, ANSI B17.1, ISO 4156 or ANSI B92.1; (c) whether the gear's and the wheel's existing flat and keyway should stay until the new tool exists (recommended: yes, so nothing built breaks) and be taken out at the end.

## Rationale

It is a change of where a feature lives and of what data the program holds, and the data is the hard part (real standards, not numbers made up), so it is asked before anything is built, as `dec_piston_maker` was.
