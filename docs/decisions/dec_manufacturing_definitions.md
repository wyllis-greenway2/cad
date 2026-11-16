---
id: dec_manufacturing_definitions
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_549, in_550, in_551
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: routes use these definitions through the contract and declare which kinds and fields they need
  - prin_variable_over_hardcoded: machines, materials and tools are data, not code
  - prin_never_box_in: a user can describe a machine or tool we never heard of
alternative_to:
---
# Machines, materials and tools are shared, user-extensible data

**AI proposal from `in_549` and `in_550`; not approved; nothing built.** The human asked how machines work, for a foundation where users can set up what is missing, and for machines and tools a user adds to be usable by others.

1. **Data versus code.** A new machine *model*, material, tool or settings table is **data**: anyone adds it, no programming. A new *process* is a **route**, which is code and a reviewed plugin. User extensions are data and templates only; code from strangers is not run (security).
2. **Definition kinds** (versioned JSON, validated, with units): *machine* (family, units, work envelope, origin, kinematics and axes, limits, G-code dialect, start and end snippets, controller capabilities, tolerance, plus route-specific fields), *material* (properties, hazards, per-process suitability, each with a source), *tool* (milling cutter, nozzle, beam: type, geometry), *settings table* (feeds and speeds; laser power and speed per thickness, keyed by machine class, material and thickness), *dialect template* (named hooks: start, end, tool change, power on and off, plus a raw custom-code escape hatch). Route-specific machine fields: FDM (nozzle, extruders, filament diameter, bed shape, chamber, maximum temperatures, volumetric flow, firmware, retraction, pressure advance); milling (spindle rpm and power, tool changer, collet, coolant, rapid rate, axes, fixtures); laser (type, power, wavelength, beam width, power scale, dynamic power, air assist, rotary); plasma, waterjet, vinyl (kerf, pierce, lead-ins). Routes ask a machine for **capabilities** ("has a 4th axis", "supports arcs"), never for its name.
3. **Presets.** Generic archetypes first ("Generic 220 x 220 Marlin printer", "Generic GRBL 3018 router", "Generic GRBL diode laser"); a few popular models as data files anyone can contribute, each editable and marked with where its numbers came from (the AI cannot verify vendor specs); user machines made by copying and overriding (`extends`). Importing Cura or Orca profile files is a later add-on, after a licence check of their data.
4. **Forgiving by design:** forms are generated from the route's parameter schema; any computed value can be overridden by hand; where data is missing the route asks and records the value, it never refuses; unknown fields are kept (an older program opens a newer definition without loss); every value carries a unit; a project stores a **copy** of the machine and material it used so it reproduces its output when presets change. Whether the library lives per user or per project is open (`q_manufacturing_open`).
5. **Provenance on every definition,** as in our own docs: author, date, version, licence, `origin` (`datasheet`, `measured`, `community`, `user`), and a trust level (`official`, `community-reviewed`, `unverified`). Unverified data is flagged and never applied silently; shared entries carry a safety note where it matters (feeds and power can break a tool or start a fire; some materials give off toxic fumes).
6. **Sharing in tiers:** (a) **packs**: export and import one file, offline, no server (built first); (b) a **community library**: a public repository of the same files, curated by review (a pull request is the moderation), little infrastructure; (c) **learning from results**: not machine learning but data accumulating; a user marks a cut as worked, burned or too slow and that settings entry gains a confidence count; an **opt-in** upload of only machine, material and settings (never part geometry) could let the library suggest defaults. Contributions come under a permissive data licence (CC0 or CC-BY) so we are not tied to a licence. Tiers (b) and (c) are not planned until the human says so (`q_manufacturing_open`).

## Rationale

Every machine has unique requirements and we cannot know them all (`in_550`); a user who can describe their own machine, material and tool is never blocked by our gaps. Keeping extensions to data keeps the platform safe and replaceable, and makes sharing a matter of files. Provenance and trust levels carry over our own rule that a recommendation is not a decision: a number from a stranger is shown as such. Starting with packs gives all the value of sharing with no server to run.
