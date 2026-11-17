# Source index

Every outside source the project has read or looked up, so it can be found again. One row per source. **The details of what a source said stay in the decision entry named in the last column** (not copied here); this index says what the source is, how it was got, whether it was read, what rights it carries and what it was used for.

**Rules.** Add a row when a source is read or looked up (same session). *Status:* `read` (the page or file was read in the session), `read, second hand` (a copy or a summary of it was read), `searched` (only a search result or its summary was seen: **not a source for a number until it is read**), `preview` (a publisher's sample only), `sent` (the human sent the file). *Rights:* the files of copyrighted standards, articles and catalogues are **not** kept in the repository; the human keeps the files sent (file name as received is given); the formulas used are facts and are written in the code with the source named. Links go stale: the date read is given. A source that disagrees with another is marked in its decision entry, not here.

## Bevel gears (`q_bevel_gears`, `dec_bevel_gears`, `prototypes/bevel-pair`, `prototypes/bevel-spherical`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| Autodesk, *Inventor 2022 Help*, "Basic Geometric Calculation for Bevel Gears" (https://help.autodesk.com/view/INVNTOR/2022/ENU/?guid=GUID-0AAB5AEF-2FAB-4706-A0DD-F6DF3DE41153); file `Inventor_2022_Help___.pdf` | read, sent (`in_722`), 2026-11-17 | CC BY-NC-SA 3.0 (non-commercial: formulas used, text not copied) | pitch angle, cone distance, equivalent teeth, addendum and dedendum with the unit correction, tooth thickness; the unit correction distribution page was not sent | `q_bevel_gears`, `prototypes/bevel-pair/README.md` |
| Brian Dengel (KHK-USA), "Standards in terminology for bevel gearing", *Gear Solutions*, July 2019, p. 28; file `khk.pdf` | read, sent (`in_723`) | copyright, article | long and short addendum (`0.54 m + 0.46 m / uv`), whole depth `2.188 m`, face width limits, tip and root angles: the proportions of the built bevel gear | `dec_bevel_gears`, `q_bevel_gears` |
| Bob Wasilewski (Arrow Gear), "Ask the expert: Backlash and Axial Movement", *Gear Technology*, Sept / Oct 2017, pp. 82-83; file `gts_6f9bc685-Bac.pdf` | read, sent (`in_734`) | copyright, article | backlash definition (outer normal backlash at the tightest point), transverse backlash, axial movement formulas; no table of values | `q_bevel_gears` |
| Gleason, *Gear Technology Solutions*, pp. 293-298 (blade definitions), as three browser prints (files as received) | read, sent (`in_734`) | copyright | nothing (cutter blade nomenclature: about making teeth, not their proportions) | `q_bevel_gears` |
| ANSI/AGMA ISO 23509-B17 (= ISO 23509:2016), publisher's preview; file `preview_ANSIAGMAISO23...pdf` | preview, sent (`in_722`) | copyright, standard | contents and scope only: shows where tooth depth, thickness and face width are given (sections 7, 8) | `q_bevel_gears` |
| AGMA 937-A12, publisher's preview | preview, sent (`in_722`) | copyright, standard | contents only | `q_bevel_gears` |
| Boston Gear, *Engineering Information: Miter and Bevel Gears* (https://documents.mrosupply.com/product_documents/SH/SH82-P/1930-bg_engineering-info-miter-and-bevel-gears.pdf), 2026-11-17 | read (shell download) | copyright, catalogue | stock gear proportions (20 degrees, long and short addendum, `2.188/P + 0.002 in`): agreed with KHK to 0.012 m | `prototypes/bevel-pair/README.md` |
| Stadtfeld, Gear Technology, Jan 2001 (https://www.geartechnology.com/ext/resources/issues/0101x/stadtfeld.pdf) | searched | copyright, article (free to read) | **to read next:** the octoid defined | `q_bevel_gears` |
| Dooner and Vivet, "Deproximating Tredgold's approximation" (open postprint: https://lirias.kuleuven.be/bitstream/123456789/539234/1//MMTPaper-Tredgold-postprint.pdf) | searched | open postprint | **to read next:** the error of the Tredgold tooth | `q_bevel_gears` |
| Gear Technology, "Bevel Gear", 2015 (https://ik.imagekit.io/agmamedia/gt/issues/0315x/Bevel-Gear.pdf); "A Practical Approach for Modeling a Bevel Gear", AGMA 14FTM13 (https://geartechnology.com/a-practical-approach-for-modeling-a-bevel-gear) | searched | copyright, articles (free to read) | **to read next:** the octoid and the generalized tooth thickness | `q_bevel_gears` |
| Thermal Processing, "Computerized design of straight bevel gears with optimized profiles for forging molding or 3D printing" (https://thermalprocessing.com/computerized-design-of-straight-bevel-gears-with-optimized-profiles-for-forging-molding-or-3d-printing/) | searched | copyright, article (free to read) | **to read next:** spherical involute derivations | `q_bevel_gears` |
| Figliolini and Angeles, "Algorithms for Involute and Octoidal Bevel-Gear Generation", *J. Mech. Design* 127(4), 2004, DOI 10.1115/1.1900147 (abstract: https://www.bohrium.com/paper-details/algorithms-for-involute-and-octoidal-bevel-gear-generation/812273507588112385-4058) | searched (abstract only) | copyright, paywalled (ASME) | the octoid from the flat flank of a crown rack: **the equations are in it, not seen** | `q_bevel_gears` |
| SAE 1999-01-3745, "Analytical Definition and Application of Straight Bevel Gear Tooth Form" (https://saemobilus.sae.org/papers/analytical-definition-application-straight-bevel-gear-tooth-form-1999-01-3745) | searched | copyright, paywalled | the straight bevel tooth form analytically: not seen | `q_bevel_gears` |
| AGMA 929-A06 preview (https://webstore.ansi.org/preview-pages/AGMA/preview_AGMA+929-A06.pdf); ISO 23509-1:2025 (shop page https://www.sis.se/en/produkter/mechanical-systems-and-components-for-general-use/gears/iso-23509-12025, about 200 EUR) | searched | copyright, paid standards | the virtual spur gear thickness (929); the macro geometry (23509): not seen | `q_bevel_gears` |
| Gleason, *Gear Technology Solutions*, page 55 (https://www.gleason.com/gear-technology-solutions/files/basic-html/page55.html) | searched | copyright | straight bevel basics: not seen | `q_bevel_gears` |
| Our own derivation: the spherical involute (`prototypes/bevel-spherical/spherical.ts`), from the condition that the curve's tangent makes a constant angle with the axis | derived, tested | ours | a stand-in for the octoid; measured the same as the Tredgold tooth at 20 / 30 teeth | `prototypes/bevel-spherical/README.md` |

## Spiral bevel and hypoid gears (`q_spiral_hypoid_gears`, `prototypes/bevel-spiral`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| NASA NTRS circular-cut spiral bevel papers (https://ntrs.nasa.gov/api/citations/19820018805/downloads/19820018805.pdf, .../19810017922/downloads/19810017922.pdf, .../19830024896/downloads/19830024896.pdf) | searched | US government work (public) | **to read next:** the tooth surface equations of a circular-cut spiral bevel gear; the spiral as a logarithmic spiral a circular arc approximates | `q_spiral_hypoid_gears` |
| Gear Technology, Aug 2015, "chapter2.pdf" (https://ik.imagekit.io/agmamedia/gt/issues/0815x/chapter2.pdf) | searched | copyright, article (free to read) | **to read next:** a worked spiral bevel example (30 degrees, cutter radius 76.2 mm, 13 / 35 teeth) to check a model against | `q_spiral_hypoid_gears` |
| "The intrinsic pitch cones in hypoid gears", AGMA media (https://ik.imagekit.io/agmamedia/2025/10/09/the-intrinsic-pitch-cones-in-hypoid-gears_rmx2WSkU4.pdf) | searched | copyright | **to read next:** hypoid pitch cones | `q_spiral_hypoid_gears` |
| ISO 23509 (spiral and hypoid in one set, section 5.9 the hypoid geometry; preview of ANSI/AGMA ISO 23509-A08: https://webstore.ansi.org/preview-pages/AGMA/preview_ANSI+AGMA+ISO+23509-A08.pdf) | searched (contents only) | copyright, paid standard | the formulas: not seen | `q_spiral_hypoid_gears` |
| The spiral angle at a cone distance (Wasilewski, `in_734`, listed under bevel gears) | read | | `prototypes/bevel-spiral/spiral.ts` | `prototypes/bevel-spiral/README.md` |

## Spur, helical, ring and rack gears, bores (`dec_gear_tool`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| ISO 53 and DIN 867 (the basic rack and the involute tooth: public mathematics, the standards themselves not read) | known maths, standards not read | copyright, standards | involute tooth, module, pressure angle, clearance 0.25 m | `dec_gear_tool` |
| DIN 6885 (parallel keys and keyways: widths and hub depths by bore, 6 to 38 mm) | known table, the standard not read | copyright, standard | the standard key and depth offered for a bore | `dec_gear_tool` (`in_589`, `in_690`), `operation/bore.ts` |
| ISO 773 and ANSI B17.1 (keyways) | not read | | listed as a way to verify more bore sizes | `docs/roadmap.md` |

## Worm gears, clock gears (`dec_worm_gears`, `dec_gear_tool`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| The ZA worm and the throated wheel (the axial section a rack; the wheel the envelope of the worm): derived in the code | derived; standards not read | | the worm, its wheel and how they fit (measured in the kernel) | `dec_worm_gears` |
| DIN 3975, ISO 14521, AGMA 6022 (worm geometry); DIN 58400 and 58405 (clock gear tooth forms) | not read | copyright, standards | listed as what would verify the worm and clock gears | `docs/roadmap.md` |

## Timing pulleys and chain sprockets (`q_timing_pulleys`, `dec_gear_tool`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| Pfeifer Industries, "Timing Belt Pulley PD and OD" charts (https://www.pfeiferindustries.com), 2025-11-16 | read | copyright, catalogue | pitch diameter, outside diameter, pitch line differential U | `q_timing_pulleys` |
| SDP/SI, *Technical Section* (https://sdp-si.com/D820/PDFS/Technical-Section.pdf), p. T-15 Fig. 19 | read (as an image) | copyright, catalogue | the belt tooth of each profile (MXL, XL, HTD, GT, T) | `q_timing_pulleys` |
| Gates, *Light Power and Precision* manual (https://www.gates.com/content/dam/documents-library/catalogs/light-power-and-precision-manual.pdf) | read | copyright, catalogue | stock tables only (agrees with Pfeifer); not the groove form | `q_timing_pulleys` |
| Chief Delphi, "Timing Pulley Design Tutorial" (https://www.chiefdelphi.com/t/timing-pulley-design-tutorial/383204), with Misumi's drawing of the Gates GT belts; sent as a PDF (`in_583`) | read, sent, second hand | copyright | GT2 and 3GT belt tooth radii (R1, R2, R3, b, H, h, PLD): the pulley groove, **a belt tooth plus clearance, not the maker's groove drawing** | `q_timing_pulleys`, `dec_gear_tool` |
| ProTorque, HTD datasheet (www.protorque.net), 2026-11-16 | read | copyright, catalogue | HTD 5M and 8M belt tooth numbers; no 3M column | `dec_gear_tool` (`in_590`), `q_timing_pulleys` |
| Ondrives (GT2 stock sheet), SIT TOP DRIVE HTD catalogue, MRO 60-groove 5M sheet | read | copyright, catalogues | stock tables only; no groove | `q_timing_pulleys` |
| Gates PowerGrip GT2 and HTD design manuals; ISO 13050 (pulley grooves) | not read | copyright | **the groove drawings: to get** | `q_timing_pulleys`, `docs/roadmap.md` |
| ANSI B29.1 (roller chain sprocket tooth form: the maths as built) and ISO 606:1994 as printed in US patent 7128673 | known maths; the ISO limits read in the patent | standards copyright; the patent text is public | the sprocket outline and the ISO 606 seat and flank limits; the **outside diameter limits** have no source | `dec_gear_tool` (`in_584`, `in_588`) |

## Fasteners (`dec_parts_fastener_pilot`)

Read in full from the pages named in the entry (Albany County Fasteners for ISO 273, Optimas, Misumi, CDE, omdl, Westfield, Hexagon & Bolt, the iTeh samples of ISO 10642:2004 and the later change lists). The rule there is two independent sources that agree; where they differ the entry says so. **Not repeated here: the entry holds each source with its date.**

## Planetary gears (`q_planetary_gears`, `dec_planetary_gears`)

Searched only, a mix of good and weak (industrialmonitordirect.com, Eng-Tips thread 357212, Glinsky's notebooks, AGMA "Epicyclic gearboxes" Aug 2021, tec-science, woodgears.ca, tspi.at); the maths is checked in `prototypes/planetary`, not taken from them. Listed in the entry.
