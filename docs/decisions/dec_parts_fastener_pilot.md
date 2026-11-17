---
id: dec_parts_fastener_pilot
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_691, in_695, in_696, in_697, in_698, in_699
date: 2026-11-17
depends_on:
  - dec_parts_library: the pilot is the first generated family of that library
  - dec_parts_interface: the pilot is the first set of families the Add part panel shows
  - dec_parts_tolerance: every table value is nominal, minimum or maximum with a cited source; the printer's offset stays out of the table
alternative_to:
---
# Pilot: metric fasteners and their matching receivers

**Accepted by the human only for the hex nut and the countersunk screw (`in_698`), proposed by the AI from `in_695`. The other families wait for their data ("Data status").** The human asked for a simple first subset with really good data, with each fastener paired with a receiver.

1. **Sizes:** M3, M4, M5, M6 and M8, coarse thread.
2. **Fasteners:** hexagon socket head cap screw (ISO 4762), hexagon socket countersunk head screw (ISO 10642), hexagon nut (ISO 4032), plain washer (ISO 7089). Button head (ISO 7380) only if its data is as easy to get. Not in the pilot: inch sizes, fine threads, visible threads, inserts, self-tapping screws, other families.
3. **Receivers, each calculated from the fastener's own row plus a setting:**
   - **Clearance hole** for the shank: fine, medium or coarse (ISO 273), the person chooses; no material dependence.
   - **Counterbore** for the socket head: diameter and depth from the head's size plus a clearance.
   - **Countersink** for the flat head: the head's angle and diameter, and the depth that follows from them.
   - **Tapped hole:** the tap drill, the nominal diameter less the pitch for about 75% engagement; **engagement is a setting with that default** (the only material-dependent receiver, as a choice, not a table per material), and the hole depth.
   - **Nut trap:** a hexagon pocket from the nut's across flats and thickness; the printer's fit offset is added later in the manufacturing version (`dec_parts_tolerance`, point 3), never here.
4. **Tolerances:** every dimension is stored with its minimum and maximum where a source gives them; the receiver shows the hole at the nominal and the gap at the part's extremes (`dec_parts_tolerance`, points 1 and 4).
5. **Data rule:** a value enters a table only when read from at least two independent sources that agree (the standard's number and the sources named in the entry's data note); a disagreement leaves the value marked unverified and out of the build until the human decides. No value is written from memory or from a summary of a search.

## Built (`in_698`): the hex nut and the countersunk screw

`operation/fasteners.ts` (the tables, the receivers' numbers and the steps that draw a part), `interaction/addpart.ts` (the dialog and the run), the ⋯ menu's **Add part…** row, `test/fasteners.test.ts`. **Hex nut (ISO 4032)** M3 to M8: a hexagon at its nominal width across flats with the thread's hole at the nominal diameter, extruded its thickness, at the origin on the ground plane. **Countersunk screw (ISO 10642, the 1997 edition's figures)** M3 to M8: the side view (the 90 degree cone, the shank, the axis) turned a full turn, then the hexagon socket cut down its minimum depth; any length over the head's height plus half a millimetre (the standard length list was not read). **Receivers:** the clearance hole (ISO 273, fine, medium, coarse), the tap drill (nominal less pitch), the countersink and the nut pocket, as numbers (`clearanceHole`, `tapDrill`, `countersink`, `nutTrap`); the dialog shows them for the size chosen. **Receivers cut into a body (`in_699`):** the ⋯ menu's **Fastener hole…** row, with one flat face of a body selected: a **clearance hole** (ISO 273 fine, medium or coarse), a **countersunk clearance hole** (the hole with a 90 degree cone at its mouth, as wide as the screw's theoretical head), a **hole to tap** (the tap drill) or a **nut pocket** (the nut's hexagon, as deep as the nut, with the clearance hole through). The hole is put at the middle of the face's box, or as far from it as typed along the face's own two directions; its depth is typed, empty goes right through. Round receivers are a plane through the hole's axis and a revolve cut of the side view; the pocket is an extrude cut on the face. They are ordinary steps made as one command, so a receiver (and a part) is one step to undo. The kernel's volumes are checked against the formulas. **Not built:** a hole put at a picked point, circle or corner (only the middle and a typed offset), blind clearance holes with a counterbore, the tap drill's engagement setting, mating points, the part kept as family and numbers (the part is ordinary steps, so its sketches can be edited but its size cannot be changed by number), threads on the part (the hole is at the nominal diameter), and the families without enough data (socket head cap screw, washer, button head). The kernel checks the volumes against the formulas.

## Data status (read 2026-11-17; **no value is in the program yet**)

The sources were read in full with the table's own headers (downloaded and parsed as text, not from search summaries). The session first moved to the saved `cad` environment, and the human approved adding the hosts the sources are on. **Read:** Albany County Fasteners (ISO 273 chart, PDF), Optimas (tap and clearance drills, page), CDE Fasteners (ISO 4762 sheet, PDF), Misumi (socket head cap screw table, page), Westfield Fasteners (ISO 10642, ISO 7089 and DIN 934 / ISO 4032 sheets), H&B (ISO 4032 sheet, PDF), the 1997 sample of ISO 10642 (iTeh; scanned text, read with errors), and the omdl ISO 4032 table. **Not reachable (no data seen):** fasten.it, lbas.lboro.ac.uk, wermac.org, eshop-pl.boellhoff.com (no answer); engineersedge.com and eshop-cz.boellhoff.com (refused, 403).

Where each table stands against the two-source rule (point 5):
- **Clearance holes, ISO 273 (fine / medium / coarse, mm):** M3 3.2 / 3.4 / 3.6; M4 4.3 / 4.5 / 4.8; M5 5.3 / 5.5 / 5.8; M6 6.4 / 6.6 / 7.0; M8 8.4 / 9.0 / 10.0. Albany (named ISO 273, classes H12 / H13 / H14) and Optimas give the same numbers. **Two sources agree.** (A search summary had said M3 was missing; it is there.)
- **Tap drill, coarse thread:** M3 2.5, M4 3.3, M5 4.2, M6 5.0, M8 6.75 (Optimas). These equal nominal less pitch, so the rule agrees; **only one source for the numbers**, the rule is the second.
- **ISO 10642 countersunk (M3 / M4 / M5 / M6 / M8):** theoretical head diameter max 6.72 / 8.96 / 11.20 / 13.44 / 17.92; actual head diameter min 5.54 / 7.53 / 9.43 / 11.34 / 15.24; head height max 1.86 / 2.48 / 3.1 / 3.72 / 4.96; socket nom 2 / 2.5 / 3 / 4 / 5; socket depth min 1.1 / 1.5 / 1.9 / 2.2 / 3 (Westfield, as ISO 10642). The 1997 sample of the standard, read with scan errors, shows the same head diameters and heights. **Two sources agree, but both are the 1997 edition's figures as far as can be told: the 2019 edition, which partly changed head dimensions, has not been read, and the human decides which edition the pilot follows.** The head angle is 90 degrees to 92 degrees in the 1997 figure (the Westfield sheet's "60 degree" note is unexplained and is not used).
- **ISO 4762 socket head (M3 / M4 / M5 / M6 / M8):** body diameter max 3 / 4 / 5 / 6 / 8; head height max 3 / 4 / 5 / 6 / 8; hex socket 2.5 / 3 / 4 / 5 / 6; head diameter **differs between sources:** Misumi 5.50 / 7.00 / 8.50 / 10.00 / 13.00 max (min 5.32 / 6.81 / 8.29 / 9.78 / 12.73) and CDE 5.68 / 7.22 / 8.72 / 10.22 / 13.27 max (min 5.32 / 6.78 / 8.28 / 9.78 / 12.73). The larger CDE values may be the figures for a knurled head against a smooth head, but **no source read says so, so this is a guess and the head diameter stays unverified.**
- **ISO 4032 hex nut (M3 / M4 / M5 / M6 / M8):** across flats max 5.5 / 7 / 8 / 10 / 13 (min 5.32 / 6.78 / 7.78 / 9.78 / 12.73); thickness max 2.4 / 3.2 / 4.7 / 5.2 / 6.8 (min 2.15 / 2.9 / 4.4 / 4.9 / 6.44); across corners min 6.01 / 7.66 / 8.79 / 11.05 / 14.38 (the H&B sheet headed ISO 4032 and the omdl table agree). **Two sources agree.** The Westfield sheet is **DIN 934** and has other thicknesses for M5 to M8 (4.0 / 5.0 / 6.5 max): it must not be mixed in.
- **ISO 7089 washer (M3 / M4 / M5 / M6 / M8):** inner diameter nom 3.2 / 4.3 / 5.3 / 6.4 / 8.4 (max 3.38 / 4.48 / 5.48 / 6.62 / 8.62), outer diameter nom 7 / 9 / 10 / 12 / 16 (min 6.64 / 8.64 / 9.64 / 11.57 / 15.57), thickness nom 0.5 / 0.8 / 1 / 1.6 / 1.6 (Westfield). **Only one source read:** a second is needed.
- **Counterbore sizes:** the Misumi page gives none. **No source yet.**
- **omdl licence:** the page read states none; its repository was not read. Not used; the check stays with `q_parts_open_sources`.

**Left to decide:** which ISO 10642 edition to follow; whether to accept the ISO 4762 head diameter with a source that settles knurled against smooth; a second source for the washers and for counterbores.

## Rationale

Starting with five sizes and four fasteners proves the family schema, the matching receivers and the tolerance rules with the fasteners most printed designs use, without waiting for the whole library (`in_691`). Pairing each fastener with its receiver costs little, since every receiver is a small function of the fastener's own row (`in_695`), and it is the part a designer needs most. The data rule exists because a wrong dimension on a screw makes a failed part, and the first search already shows sources that disagree.
