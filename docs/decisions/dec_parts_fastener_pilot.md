---
id: dec_parts_fastener_pilot
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_691, in_695, in_696
date: 2026-11-17
depends_on:
  - dec_parts_library: the pilot is the first generated family of that library
  - dec_parts_interface: the pilot is the first set of families the Add part panel shows
  - dec_parts_tolerance: every table value is nominal, minimum or maximum with a cited source; the printer's offset stays out of the table
alternative_to:
---
# Pilot: metric fasteners and their matching receivers

**Drafted from `in_695`, not yet approved. Nothing built, and no table value is written yet** (see "Data status"). The human asked for a simple first subset with really good data, with each fastener paired with a receiver.

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

## Data status (found 2026-11-17, **none of it read or accepted**)

Candidate sources found by a web search, whose short summaries are not data and **must be read in full** before any number is used. The search already showed what to watch for:
- **ISO 273 clearance holes:** the standard itself is paywalled ([ISO](https://www.iso.org/standard/4183.html)); charts to read: [Albany County Fasteners](https://www.albanycountyfasteners.com/media/6b/b8/g0/1764944339/clearance-hole-chart.pdf), [Loughborough chart](https://lbas.lboro.ac.uk/chart/metric-clearance-hole-chart.html), [Engineers Edge](https://ns2.engineersedge.com/calculators/asme-metric-clearance-holes/asme-metric-clearance-holes.htm). A first look gave M4 to M8 values but **no M3 value** and no table headers: M3 is open.
- **ISO 4762 screws:** [fasten.it](https://fasten.it/norms/norm/din_en_iso_4762), [Misumi](https://us.misumi-ec.com/blog/metric-socket-head-cap-screws-dimensions/), [Engineers Edge](https://engineersedge.com/iso_socket_head_screw.htm), [CDE Fasteners](https://cdefasteners.com/sites/default/files/product-specs/metsocketcap.pdf). **A first look found disagreements** in the head diameter limits of M4 and M5 between sources.
- **ISO 10642 countersunk:** [Westfield](https://westfieldfasteners.co.uk/Standards/ScrewBolt-SHCsk-M.pdf), [Böllhoff](https://eshop-cz.boellhoff.com/out/media/pdf/ISO_10642_Stahl_8.8___en.pdf), [Engineers Edge](https://engineersedge.com/hardware/bs_en_iso_10642_14583.htm), a sample of the 1997 standard ([iTeh](https://cdn.standards.iteh.ai/samples/18737/3f421aa0f7854e96b2815a241b29a69a/ISO-10642-1997.pdf)). **The standard was revised in 2019 and head dimensions partly changed, and two suppliers disagree on the M3 head diameter:** which edition the pilot follows must be settled first.
- **ISO 4032 nuts:** [hbbolt datasheet](https://www.hbbolt.com/_Product_Cut_Sheets/HexNutMetricCL8.pdf), [wermac](https://wermac.org/bolts/dimensions_hex-nuts_across-flats-and-heights_din-iso.html), [Westfield](https://www.westfieldfasteners.co.uk/Standards/Nut_Hex_M.html), [ssmalloys PDF](https://ssmalloys.com/wp-content/uploads/2024/10/ISO-4032.pdf). Several sources appear to agree; older DIN 934 tables differ and must not be mixed in.
- **ISO 7089 washers:** [Westfield](https://westfieldfasteners.co.uk/Standards/Washer-ISO7089-M.pdf), [Böllhoff](https://eshop-pl.boellhoff.com/out/media/pdf/ISO_7089_Stahl_HV2___en.pdf), [fasten.it](https://fasten.it/norms/norm/din_en_iso_7089). The search returned no usable M3 to M8 rows yet.
- **Tap drills:** [Optimas](https://optimas.com/technical-resources/tapping-sizes/) and the derived rule (nominal less pitch); to be read and compared.
- **Counterbore sizes:** no source found yet; counterbore diameters differ between sources and are not part of ISO 4762 itself.
- **The omdl OpenSCAD database** ([ISO 4032](https://royasutton.github.io/omdl-snapshot/docs/html/omdl-v1.0/group__database__component__fastener__iso__4032.html), [ISO 7089](https://royasutton.github.io/omdl-snapshot/docs/html/omdl-v1.0/group__database__component__fastener__iso__7089.html)) holds tables as data; its licence is **not yet read** and belongs to `q_parts_open_sources`.

## Rationale

Starting with five sizes and four fasteners proves the family schema, the matching receivers and the tolerance rules with the fasteners most printed designs use, without waiting for the whole library (`in_691`). Pairing each fastener with its receiver costs little, since every receiver is a small function of the fastener's own row (`in_695`), and it is the part a designer needs most. The data rule exists because a wrong dimension on a screw makes a failed part, and the first search already shows sources that disagree.
