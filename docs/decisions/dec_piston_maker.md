---
id: dec_piston_maker
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1255, in_1258
date: 2026-11-20
depends_on:
  - dec_piston_parameters: the variables here are that entry's numbers and rules made into typed fields; its sources and assumptions are the presets' and defaults' evidence
  - dec_engine_presets: Honda's values are presets (starting values), as built there
  - prin_manufacture_agnostic: no variable is shaped by a way of making the piston
alternative_to:
---
# The piston maker: every variable that builds the piston (the list, and its first stage built)

The human asked (`in_1255`) for a piston maker whose menu holds **every variable that builds the piston**, with real engines' values as presets only. This is the list, in nine groups. **Status of each today:** **T** typed in the engine's box; **H** hard-coded in the code (a rule or a proportion); **N** not in the model at all. **Preset values** exist only for Honda (GX120/160/200) and only where a source gives them (S); the rest would be defaults from the assumed rules (A).

**1 Interface and material.** Bore (from the engine) T; skirt fit, diametral (S: 0.015 to 0.050) T; material (cast aluminium, hypereutectic, forged 2618, cast iron, steel: sets density, expansion and the default fits) N; piston to deck at top dead centre N.
**2 Overall size.** Pin height (compression height) H (a stack: top land + rings + pin radius + margin) as a typed value or auto; skirt length below the pin H (0.27 B, A); overall length (derived).
**3 Crown.** Thickness T (0.08 B, A); shape: flat, dome, dish, bowl N; dome or dish height and radius N; bowl diameter, depth, offset N; valve reliefs: count, diameter, depth, angle, position N; squish band width N; edge chamfer or radius N.
**4 Ring belt.** Number of compression rings T (0 to 3); oil ring groove T (0/1); top land height T (0.07 B, A); each ring's type (rectangular, taper, barrel, keystone), height (S: 1.5, 2.5 mm) H, radial width H (B/22, A); land between rings H (1.6 times a ring, A) as a typed value per land; groove side room T (S: 0.015 to 0.045); back room H (0.45 mm, A); groove tilt N; groove corner radii N; land relief (the lands' diameter less than the skirt's, per land) N (S: Scraba, cartecc); land taper N; accumulator groove N; gas ports N; ring end gap (a ring body) N (S: 0.2 to 0.4 mm).
**5 Oil control.** Drain holes per side T; drain hole diameter, angles, height H (A); drain slots instead of holes N; undercrown oil jet or gallery N.
**6 Skirt.** Wall thickness T (0.04 B, A); style: full, slipper, two pads (S: Caterpillar 70 to 90 degrees) N; oval (smaller along the pin) N; taper top to foot N; barrel N; cutouts or windows N; relief at the pin bosses N; lightening holes N; coating thickness N; foot chamfer N.
**7 Pin and bosses.** Pin diameter T (S); pin length H; pin fit T (S: 0.002 to 0.014); pin bore, hollow (the pin's inner diameter) N; boss spacing (inner) H; boss reach and shape H (a wall beyond the hole, A); ribs from bosses to crown N; pin offset toward the thrust side N; retention: circlips (S: Honda), end plugs, press fit, tapered screws N; circlip groove position and width N; pin bush N; pin bore chamfer and oil slots N.
**8 Interior.** Cavity shape, wall variation, under-crown ribs N; internal fillets N; balance pads N.
**9 Edges.** One general radius or chamfer for every sharp edge, and the crown edge, foot and groove corners separately N.

**Outputs the maker should show (not variables):** weight (from volume and material), pin height, dome or dish volume and its effect on the compression ratio, land clearances, the ring pack's stack, the thinnest wall, which numbers are Honda's and which assumed.

**How a variable is set (proposed):** each field is either a **typed value** or **auto** (the assumed rule works it out); a preset fills the typed values from a real engine; a field typed is never moved by another (as the model box does for typed numbers). About 50 variables in all.

## Rationale

The human wants every variable of the build in the menu, with spec values as presets only. Listing them by group with their status today shows what is already a field (T), what is a hidden rule that must become a field (H) and what the model cannot do yet (N). It is provisional until the human reviews the list.

## Stage 1, built (`in_1258`)

The human approved building the hard-coded variables first and giving the piston its own maker box. **Built:** a model kind **Piston** (*Models > Piston*, `model:piston`) with its own box: a standalone piston and its pin, crown up, from every variable of the piston that is typed or now typed; the engine builds its piston by the same code (`operation/modelpiston.ts`), so the two cannot differ. The **H variables are now typed fields, each `0` = auto** (the assumed rule works it out): pin height, skirt length below the pin, pin length, compression ring height, oil ring height, ring radial width, the land between rings, groove back room, drain hole diameter, the boss gap (the room between the bosses) and the boss reach. With every one at 0 the piston is exactly the engine's of before (a test holds the volumes). Presets: Honda GX120, GX160 and GX200 (bore, pin, rings). **Not built (the N variables):** material, crown shapes and valve reliefs, ring types, land relief, circlip grooves and a hollow pin, skirt oval, taper and style, ribs, edges. **The engine's box does not show the new fields** (they are auto there): a later step is to let the engine take its piston from the maker's numbers.

## Stage 2, built (`in_1260`, `dec_piston_lands_clips`)

Land relief (two typed numbers) and circlip retention (a typed Pin retention, the groove's width, depth and distance from the face, the pin's end float, and two circlip bodies) are built, and the engine has them too (nine bodies). **Still not built:** material, crown shapes and valve reliefs, ring types, hollow pin, the other pin retentions, skirt oval, taper and style, boss ribs, edges.

## Stage 3, built (`dec_piston_material`)

The material (density, weight, the default room in the bore) and a hollow pin. **Still not built:** crown shapes and valve reliefs, ring types, the other pin retentions, skirt oval, taper and style, boss ribs, edges.

## Stage 4, built (`dec_piston_skirt`)

The skirt's shape: oval, taper, a chamfered foot, and a full or two-pad style. **Still not built:** crown shapes and valve reliefs, ring types, the other pin retentions, a barrel profile, boss ribs, skirt windows and lightening holes, other edges.

## Stage 5, built (`dec_piston_crown`)

The crown: flat, dome, dish or bowl, its edge chamfer and valve reliefs. **Still not built:** ring types, the other pin retentions, a barrel profile, boss ribs, skirt windows and lightening holes, the other edges.
