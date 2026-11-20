---
id: dec_view_looks
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1379, in_1378
date: 2026-11-20
depends_on:
alternative_to:
---
# Four looks, made in one place

A part of the view has one of four looks, each made in `ui/looks.ts` and nowhere else:
1. **Solid**: opaque and lit.
2. **See-through**: the dark nearly clear look the wireframe had (colour 0x14161a, opacity 0.14, no depth write). It is used for the wireframe body (menu, the mover's orient mode, revolve, mirror, sweep, loft, a pulled hollow wall), for the body when a sketch plane is looked at straight with the body in front, and when a cut is being made (these two were a lighter fade before), and for the stand-ins of parts.
3. **Cut**: a part clipped by a plane, with the hatch on the cut; a face that lies on the cut is Solid.
4. **Marked**: a colour laid over the others: teal (selected, pointed at, preview: the highlight) and red (a clash, the thin places of a measure, and what a cut takes away), with two strengths for the red (`MARK`).

A look is set on a material from the material's own colour (`setLook`), and a copy for another look is made from that, never from a material that is in a look just now. The settings `theme.bodyFadeOpacity` and `measure.thinColor`, `thinOpacity` are gone.

## Rationale

The looks were set in one place and read in another, so a look leaked: the face on the cut had been copied while a mirror made the body wireframe and stayed dark and see-through (`in_1378`). The human asked for a few reused looks, and approved these four, with the current wireframe as the see-through one (`in_1379`).
