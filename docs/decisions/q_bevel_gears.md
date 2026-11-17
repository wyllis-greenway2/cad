---
id: q_bevel_gears
kind: question
status: open
origin: ai-unreviewed
human_input: in_722, in_721, in_720, in_719
date: 2026-11-17
depends_on:
  - dec_gear_tool: a bevel gear would be one more kind of gear record, with its own body made from the record; a change to how a gear is a record changes it
  - dec_loft_sketches: the body is a ruled loft between two scaled sections
  - prin_manufacture_agnostic: the geometry is the true tooth, not what prints well; nothing per manufacturing route
alternative_to:
---
# Bevel gears: the prototype works; which standard's proportions, and what to build

**Asked (`in_719`):** 90 degree gears and other angles, as real profiles to the standards, manufacturing agnostic. **The prototype (`in_720`, `prototypes/bevel-pair`)** makes a straight bevel pair for any shaft angle as ruled lofts of a Tredgold back cone tooth and it fits (no overlap at the computed place, 2 to 4 mm3 at 0.3 mm closer, 120 to 220 mm3 tooth on tooth), see its README. **Sources (`in_722`: the human sent three PDFs):** the Autodesk Inventor help page "Basic Geometric Calculation for Bevel Gears" gives the formulas (pitch angle, cone distance, equivalent teeth, addendum `m (ha* + x - k)`, dedendum `m (ha* + c* - x)`, dedendum reduction `k = 0.02 (17 - zn)`, face and root angles, tooth thickness with the unit correction) and the prototype now uses them (the fit is unchanged); the ISO 23509 and AGMA 937 PDFs are previews with no formulas, and show which sections hold the rest. **What is still open:** (1) the defaults the page does not give: `ha*` and `c*` (1 and 0.2 are used, unverified), how the unit correction `x` (the long and short addendum) is shared between pinion and gear, and the face width: these are the page's own sub-pages, "Distribution of Unit Corrections for Single Gears" and "Design of Face Width" (and the maximum dedendum filleting), and AGMA 937 Table 10 and Figure 8 or ISO 23509 section 7; before this the proportions were Boston Gear's stock numbers (20 degrees, `a = m`, `hT = 2.188 m + 0.0508 mm`, tooth thickness `pi m / 2`), not the standard's (AGMA 2005 / ISO 23509 / DIN 3971 could not be read here: paywalled, and the sites of KHK, Autodesk and Engineers Edge are not on the session's allowed hosts); the standards' long-and-short addendum (the pinion's addendum longer, by the ratio) is not applied; (2) the face width (a third of the cone distance, from lecture notes, and a minimum of 10 m from the same); (3) backlash, undercut and pointed teeth checks for small tooth counts; (4) the tool: a Bevel gear in the Gear submenu and a Mesh bevel gear that places the partner at the shaft angle with the other's apex and phase; spiral bevel (a lengthwise curve at a spiral angle, 35 degrees in the maker's stock gears) and hypoid (shafts that do not meet: an offset) as approximations marked as such, since their flanks come from machine settings, not a formula. **The human decides** whether to build it and from which source (a source the human can send, as the pulley data was).

## Rationale

A bevel gear pair is the usual way to turn a shaft through an angle; the loft the worm wheel uses makes its tooth exactly, and the measured fit says the geometry is sound. The proportions are what a standard fixes, and this record does not guess them: the numbers used are named with where they came from and marked unverified.
