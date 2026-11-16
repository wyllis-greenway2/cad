---
id: q_timing_pulleys
kind: question
status: open
origin: ai-unreviewed
human_input: in_550, in_549, in_548
date: 2026-11-16
depends_on:
  - dec_gear_tool: pulleys are the next profile family of the one gear tool and share its record, box, edit and move
alternative_to:
---
# Timing pulleys: the belt dimensions read so far, and the groove shape that is still missing

**Asked (`in_548`):** timing pulleys, after the refusal messages (done). The human agreed (`in_549`) that the AI should ask for network access to read the real tables; a personal environment `cad` allowing `www.pfeiferindustries.com`, `pfeiferindustries.com` and `www.york-ind.com` (and the `www.zajaru.com` the Default had) was approved and made.

**Read from a source (Pfeifer Industries, "Timing Belt Pulley PD and OD" charts, https://www.pfeiferindustries.com, 2025-11-16):** the pitch diameter is pitch × teeth / π, the outside diameter is smaller by twice the pitch line differential U (the distance from the cord to the bottom of the belt tooth). From the metric rows of the charts:
- 2 mm PowerGrip GT / GT2: 20 teeth, PD 12.73, OD 12.22: U = 0.255 (0.254 mm)
- 3 mm HTD: 20 teeth, PD 19.10, OD 18.34: U = 0.38 (0.381 mm)
- 5 mm HTD: 20 teeth, PD 31.83, OD 30.69: U = 0.57 (0.572 mm)
- 0.080" MXL (2.032 mm): 20 teeth, PD 12.94, OD 12.43: U = 0.254 mm
- The T2.5 and T5 charts do not follow PD = pitch × teeth / π (T2.5 10 teeth PD 8.05; T5 10 teeth PD 16.05), so their rule is not taken from this yet.
- The York Industries page is the inch MXL / XL / L standard's text (its groove profile is "formed by the generating tool rack form" of its Table 3, which is an image or a download, not on the page).

**Second try (`in_550`):** the human allowed more hosts; `www.ondrivesus.com`, `sitspa.com`, `www.optibelt.com` and `documents.mrosupply.com` were added to the environment. Read: Ondrives' GT2 pulley stock sheet, SIT's TOP DRIVE HTD catalogue and MRO's 60-groove 5M dimension sheet: all are stock tables (diameters, hubs, lengths, diameter tolerances), none draws the groove or gives its radii; Optibelt's host refuses the connection (403 through the proxy).

**Missing:** the shape of the groove itself (depth, radii, width) for each belt. No source readable from here gave it (searches returned fragments; the community OpenSCAD generators' hosts are not allowed and are not authoritative). Nothing is written from memory: a belt that does not fit is a failed part.

**Options:** the groove drawings are in the belt makers' design manuals (Gates PowerGrip GT2 and HTD, the ISO 13050 standard), which are not on the hosts allowed so far; the human pastes a table or drawing, or names a host that has one; or build the pulley outside diameter, pitch and pulley rules from the table above with a groove drawn from the belt's tooth height, marked unverified, to be checked against a real belt.

## Rationale

Kept open: the pitch line differentials are read, the groove shape is not, and the human has not chosen how to get it.
