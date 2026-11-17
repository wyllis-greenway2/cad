# Planetary set maths (a prototype, `in_736`, `in_737`)

**What it was meant to learn:** whether the rules found for planetary sets (ring = sun + 2 planets, `(sun + ring) / planets` whole, planets clear of each other, Willis ratios) are enough to place a sun, planets and ring with the app's own `gearOutline` and `meshWith` so that every mesh fits; and how to go both ways (teeth to ratio, ratio to teeth).

**What is here:** `planetary.ts` (`ratios` for ring, carrier or sun held; `check`; `fromTeeth`; `fromRatio`; `planetCentres`), `planetary.test.ts` (run from `app/`: `node --test ../prototypes/planetary/planetary.test.ts`).

**What it learned:**
- The planets are placed with `meshWith(sun, ...)` at `360 / N` apart, and the ring is turned to mesh the first planet (`meshWith` with `ring: true` round that planet). For sets that pass `check` (16/12/40 with 4 planets, 24/18/60 and 18/18/54 and 21/15/51 with 3) every sun to planet and planet to ring mesh fits (penetration under 0.003 mm, the outlines are sampled coarsely), and the planets do not touch each other. 16/12/40 with 3 planets (56 / 3 not whole) does not mesh at the other planets, so the assembly check is needed.
- Ratio to teeth: exact ratios exist when ring / sun is a ratio of whole numbers that suits the planet count (ring held, ratio 5, 3 planets: 18/27/72, 24/36/96, ...). With 4 planets a ratio of 7.3 is out of reach: the planets would touch, the nearest is about 6.4. The tool must say the nearest it can make and why, not pretend.
- Few teeth (under 17 at 20 degrees) are warned as undercut, not refused.

**Not tried:** helical sets (the planets of a helical sun are the opposite hand and the ring the same hand as the sun: `Mesh gear` does the hand; checked here only for spur), profile shift, the carrier plate, putting it in the app, planets out of phase (unequal spacing), the other holds' numbers against a real set. The rules come from web searches whose pages were not read in full (`q_planetary_gears`).
