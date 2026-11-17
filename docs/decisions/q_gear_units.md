---
id: q_gear_units
kind: question
status: open
origin: ai-unreviewed
human_input: in_662
date: 2026-11-16
depends_on:
alternative_to:
---
# Should the gear tool's numbers follow the number system (inch or mm)?

The settings page's number system (`dec_settings_page`) converts every length the app shows and types, except the **gear tool's** numbers (`gearTyped` and `typedNumber` in `tools.ts`, the gear bubbles): they are left as they were. **Left alone on purpose (`in_662`):** a gear is sized by an external standard (a module in millimetres for metric gears, a diametral pitch in teeth per inch for inch gears, a belt pitch and tooth count for the pulleys, the chain's pitch for a sprocket), and those numbers are not plain lengths that change with the unit, so converting them could make a standard gear wrong. **To review:** (1) which of the gear's fields are standards (module, pitch, tooth count, pressure angle) and which are free lengths (a bore, a width, a hub, the free-form gear's own sizes), (2) whether the free lengths should follow the number system and the standards keep their own unit and name, (3) whether a gear in inches should offer diametral pitch. **Recommendation:** convert only the free lengths (bore, width, hub), label the standards with their own units, and leave the rest; decide with the person who owns the gear code.

## Rationale

The gear tool is another branch's work (`claude/inspiring-pascal-l342k7`), built on standard tables. Changing its numbers without the standards in mind could silently change a gear that is meant to mesh with a standard part, which is the one thing a gear tool must not do.
