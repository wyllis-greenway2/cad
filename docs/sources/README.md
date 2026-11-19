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
| Stadtfeld, "Gear Mathematics for Bevel & Hypoid Gears", Chapter 2, *Gear Technology*, Aug 2015, pp. 50-56 (https://ik.imagekit.io/agmamedia/gt/issues/0815x/chapter2.pdf); file `9e72a661-chapter2.pdf` | read in full, sent (`in_793`), 2026-11-17 | copyright, article (free to read) | the worked face-milled spiral bevel set (13 / 35, 30 degrees, cutter 76.2 mm) with all numbers; the crown gear model, the cutter head radii (eq. 24-32), the machine settings, the ratio of roll, the gearing law: the model of `prototypes/bevel-spiral-generated` | `q_spiral_hypoid_gears`, `prototypes/bevel-spiral-generated/README.md` |
| Huston and Coy, "Surface Geometry of Circular Cut Spiral Bevel Gears", NASA TM 82622, 1981 (https://ntrs.nasa.gov/api/citations/19810017922/downloads/19810017922.pdf); file `1f95b8de-19810017922.pdf` | sent (`in_793`); abstract and introduction read, the rest not yet | US government work (public) | crown (flat) gear tooth surface radii of curvature for involute, straight and hyperbolic cutter profiles | `q_spiral_hypoid_gears` |
| Huston, Lin and Coy, "Tooth Profile Analysis of Circular-Cut, Spiral-Bevel Gears", NASA TM 82840, 1982 (https://ntrs.nasa.gov/api/citations/19820018805/downloads/19820018805.pdf); file `3c2bf3ef-19820018805.pdf` (20 pages) | sent (`in_794`); abstract and introduction read, the rest not yet | US government work (public) | a crown gear with a straight profile in the mid transverse plane has a hyperboloid tooth surface, and the pressure angle varies along the tooth (the face milling of Stadtfeld has straight blades in the cutter's plane, whose surface is a cone: a different crown gear) | `q_spiral_hypoid_gears` |
| Huston, "Geometrical Analysis of Circular-Cut Spiral Bevel Gears", NASA CR 168226, 1983 (https://ntrs.nasa.gov/api/citations/19830024896/downloads/19830024896.pdf); file `f5c03fa7-19830024896.pdf` (59 pages, an OCR of a scan) | sent (`in_793`); contents and introduction read, the rest not yet | US government work (public) | the circular arc against the logarithmic spiral, the spiral angle along the centre line, tooth profile changes between transverse planes | `q_spiral_hypoid_gears` |
| Stadtfeld, "The Basics of Spiral Bevel Gears", *Gear Technology*, 2001 (https://www.geartechnology.com/ext/resources/issues/0101x/stadtfeld.pdf); file `3a5ab0c9-stadtfeld.pdf` | sent (`in_793`); first page read, the scan is poor | copyright, article (free to read) | the crown gear derives the bevel flank; the octoid defined (bevel analogue of the involute) | `q_bevel_gears`, `q_spiral_hypoid_gears` |
| Zarebski, "The Intrinsic Pitch Cones in Hypoid Gears", *Gear Technology*, Sept / Oct 2025 (https://ik.imagekit.io/agmamedia/2025/10/09/the-intrinsic-pitch-cones-in-hypoid-gears_rmx2WSkU4.pdf); file `78e3e3b2-the-intrinsic-pitch-cones-in-hypoid-gears_rmx2WSkU4.pdf` | sent (`in_793`); first page read | copyright, article | hypoid pitch cones as hyperboloids depending on offset and tool: **to read for the hypoid** | `q_spiral_hypoid_gears` |
| ISO 23509 (spiral and hypoid in one set, section 5.9 the hypoid geometry; preview of ANSI/AGMA ISO 23509-A08: https://webstore.ansi.org/preview-pages/AGMA/preview_ANSI+AGMA+ISO+23509-A08.pdf) | searched (contents only) | copyright, paid standard | the formulas: not seen | `q_spiral_hypoid_gears` |
| Zarebski (above), read in full (`in_887`) | read | copyright | what a hypoid is geometrically (hyperboloid pitch surfaces replaced by cones; their angles need the spiral angle and the offset, found iteratively by the usual method; his "intrinsic" pitch cones are fixed by macrogeometry alone; example data: z 13 / 42, offset 15 mm, spiral 50 degrees, pinion cone 20.239, gear 69.389) | `q_spiral_hypoid_gears` |
| Stadtfeld, "Gear Mathematics for Bevel & Hypoid Gears", the later parts of Chapter 2: face-hobbed (https://ik.imagekit.io/agmamedia/gt/issues/0915x/hobbed.pdf), the profile shift part (https://ik.imagekit.io/agmamedia/gt/issues/0116x/bevelgear.pdf), "Gear Theory 2" (https://ik.imagekit.io/agmamedia/gt/issues/0715x/Gear_Theory2.pdf); the August 2015 part says the hypoid step (a Formate gearset with an offset) is its step four | found by search (`in_887`) | copyright | the offset's place in the gearing law: **not read** | `q_spiral_hypoid_gears` |
| NASA CR 4383 / AVSCOM TR 91-C-021 (https://ntrs.nasa.gov/api/citations/19910018232/downloads/19910018232.pdf): by its contents it has hypoid pinion and gear blank data, coordinates and normals of the tooth surfaces, formate settings; also NASA CR 4757 (Litvin and Wang, 1996, local synthesis of face-milled spiral bevel gears: the generating-surface and gearing-law formulation), found by search | found by search; the host is not reachable from this session (DNS), so not read | public (NASA) | the hypoid surface equations: **not read** | `q_spiral_hypoid_gears` |
| US patent 1,826,852, "Hypoid gear" (https://patents.google.com/patent/US1826852A/en): the pinion generated conjugate to a basic (crown) gear whose axis is offset from the pinion blank's | found by search | public domain | the idea only | `q_spiral_hypoid_gears` |
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

## Planetary gears (`dec_planetary_gears`, `prototypes/planetary`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| Eng-tips thread 357212 (https://www.eng-tips.com/threads/planetary-gear-question.357212); Chad Glinsky, drivetrainhub "Chapter 4 - Planetary Gears" notebook (https://nbviewer.jupyter.org/github/drivetrainhub/notebooks-gears/blob/master/geometry/Chapter%204%20-%20Planetary%20Gears.ipynb); AGMA, "Epicyclic gearboxes" (https://ik.imagekit.io/agmamedia/issues/0821/epicyclic-gearboxes.pdf), Aug 2021 | searched (web search summary, 2026-11-17: not read as pages) | copyright, forum / notebook / article | `(Zs + Zr) / N` whole for equally spaced planets in phase; out of phase (sequential) and unequal spacing exist; planet tips need clearance | `dec_planetary_gears` |
| tec-science planetary pages (https://www.tec-science.com/?p=28857); woodgears.ca (https://woodgears.ca/gear/planetary.html); tspi.at calculator (https://www.tspi.at/diy/planetarycalc.html); firgelliauto.com epicyclic pages | searched (as above) | copyright | `Zr = Zs + 2 Zp`; Willis `(ns - nc) / (nr - nc) = -Zr / Zs`; ratio with ring, carrier or sun held (some write it as the reciprocal) | `dec_planetary_gears` |
| Our own check of the rules against the kernel (`test/planetary.test.ts`): sets that pass the whole number rule fit, one that does not, does not; the ring's hand (the planets', for an internal pair) was derived from the contact geometry | derived, tested | ours | verifies the rules above; corrects the AI's earlier statement about the ring's hand | `dec_planetary_gears` |

## Ratchets (`q_ratchet_numbers`, `dec_ratchet`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| Machinery's Handbook, 31st edition, "Ratchet Gearing" (online copy: https://online.flippingbook.com/view/954046886/954) | searched; the page could not be fetched (the host is outside the session's network allowlist) | copyright, handbook | **to read next:** the pitch formula for a ratchet that holds a load, and the pawl pivot rule (the perpendicular to the tooth face on the pivot's side of the wheel's centre for a pushing pawl): only seen in a search summary | `q_ratchet_numbers` |
| engineersedge.com, ratchet-type gear calculator (https://engineersedge.com/calculators/ratchet_type_gear_design_15333.htm) | searched; could not be fetched (host not allowed) | copyright, calculator page | **to read next:** tooth proportions it cites | `q_ratchet_numbers` |
| Handbook of Machining and Metalworking Calculations, ch. 8 "Ratchets and Cam Geometry" (https://www.globalspec.com/reference/63926/203279/chapter-8-ratchets-and-cam-geometry) | searched; could not be fetched (host not allowed) | copyright, book | **to read next:** the design rule that the pawl stays engaged under load | `q_ratchet_numbers` |
| Firgelli Automations blog pages on ratchets and pawls (firgelliauto.com) | searched | copyright, vendor blog | **not used:** the face angles (85 to 92 degrees, 30 to 45), the undercut (1 to 3 degrees, another page 2 to 5) and the friction limit (about 11 degrees) disagree with each other and name no source | `q_ratchet_numbers` |
| US patents on reversible ratcheting tools (7131353, 7185566, 6918323, 7263919, via image-ppubs.uspto.gov) | searched | public | the pawl laid out with a gear arc tangent to an arc of the pawl's radius: a different layout from the pawl arm; not used | `q_ratchet_numbers` |

## Geneva drive (`dec_geneva`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| Our own derivation: the centre distance `C = a / sin(pi / n)`, the entry at `b = C cos(pi / n)`, the wheel's turn `atan2(a sin(al), C - a cos(al))` over the visit, and the locking disc as the envelope of the turning wheel (`operation/geneva.ts`) | derived, tested by simulation (`test/geneva.test.ts`) | ours | all of the Geneva geometry; no outside source was read for it | `dec_geneva` |
| Zarebski 2025 (above) worked examples, Methods 1 to 3 (Tables 1 and 2); ANSI/AGMA ISO 23509-B17 preview (7 pages) | read by a subagent (`in_967`) | copyright | the three hypoid examples (pinion and gear pitch angles with offset), no offset equation anywhere; the preview has no equations. Used as a check of `dec_hypoid_gears` (the ring's cone matches, the pinion's differs). The AGMA contents list Methods 0 to 3 and annex B "Pitch cone parameters", not in the preview | `dec_hypoid_gears` "Checked against the sources" |
| FreeCAD wiki, "File Format FCStd" (wiki.freecad.org/File_Format_FCStd) | searched (`in_1038`): the layout of the zip (Document.xml, GuiDocument.xml, .brp shapes) | open wiki (CC-BY, FreeCAD documentation) | the FCStd reader's layout; the XML details beyond it (the `Part file=` element, `ObjectDeps`, `Visibility`) are from memory and unchecked against a real file | `dec_exchange_gaps` |

## Ball bearings (`dec_bearing_library`)

| Source | Status | Rights | Used for | Recorded in |
|---|---|---|---|---|
| igus, ball bearing dimension table (igus.co.uk/ball-bearings/wiki/ball-bearing-dimension-table) | read (`in_1146`, by curl) | copyright (facts: ISO 15 sizes) | bore, outside diameter and width of the 6000 to 6006 and 6200 to 6206 series and the miniatures | `app/src/operation/bearingdata.ts` |
| NSK, deep groove ball bearing pages (oss.nsk.com, redirecting to nsk.com/engineering) | read (`in_1146`, by curl) | copyright (facts: sizes, ball count and ball diameter) | the balls' count and diameter for the 60 and 62 series | `bearingdata.ts` |
| Misumi, miniature ball bearing pages (us.misumi-ec.com) | read (`in_1146`) | copyright (facts: sizes) | the miniatures' sizes (623 to 627, 607 to 609) | `bearingdata.ts` |
| NSK and Misumi PDF catalogues | not readable (no text layer) | copyright | nothing | none |

