---
id: dec_parts_tolerance
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_711, in_712, in_713
date: 2026-11-17
depends_on:
  - dec_parts_library: every family table carries these values and the per-part override lives on the placed part
  - dec_manufacturing_prep: fit compensation is a step of the manufacturing version, so a part's own size must stay at its nominal
  - dec_manufacturing_version: a printer's offset is applied when the version is derived, not in the design part
  - dec_measure_report: the check of a part against its hole reports gaps with the measuring already built
alternative_to:
---
# Nominal, minimum, maximum, the real part, and the printer: kept in separate places

**Accepted by the human (`in_713`) as proposed by the AI from `in_711`. Nothing built.** The human asked how to handle the case where a real part's size is slightly different from the listed or standard size.

1. **A table value says what it is.** Each dimension in a family table is a *nominal*, with a *minimum* and a *maximum* where the standard gives them, each with a cited source (`dec_manufacturing_definitions`, point 5, applies: the AI writes no dimension from memory). Where no tolerance can be cited the entry says "nominal only" and none is invented. The part is generated at the nominal by default.
2. **A measured part overrides one part, not the library.** A person can set any dimension of a placed part to what they measured ("my screws are 5.62 across the head"). The override is stored on that part with a note that it is theirs, and shows as an override; the library is not changed. A project that keeps a copy of a part (`dec_parts_library`, point 5) keeps the override with it.
3. **The printer's error is not in the part.** A hole printed at 3.0 mm usually comes out small. That is a property of the machine and process, so it is the **fit offset** of the manufacturing version (`dec_manufacturing_prep`, point 3), applied when the version is derived, with presets (tight, normal, loose) and a value the person measured for their own printer. The design part and the family table always hold the true size.
4. **The fit is checked, and advises only** (`in_546`): when a part sits in a hole or pocket the program compares them at nominal, at the part's minimum and at its maximum, and reports the gap in each case ("0.2 mm clear at nominal, 0.05 mm at the screw's maximum size"), with the measuring already built for clearance (`dec_measure_report`). A tight or negative gap is a finding, never a block.
5. **Both numbers are shown:** where a hole is made from a family (the fastener holes), the form shows the nominal hole and the clearance chosen, and which fit setting was added, so no size is silently changed.

## Rationale

"M3" is a name, not a measurement: standards allow a range, vendors drift within or beyond it, and printers add their own error. If all three were folded into one number the model would be wrong for every other printer and every other batch of screws. Keeping them apart keeps the design part true and shareable, puts the printer's error where `dec_manufacturing_version` already says it goes, and lets the check say what will really happen at the extremes.
