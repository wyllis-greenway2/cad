---
id: dec_unified_orb
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1127, in_1128
date: 2026-11-19
depends_on:
  - dec_orb_positioning: its rules (Shift holds the drag to one, two or three axes; the orb sticks to places; a click on a plane puts it there) are the ones every orb is to have
  - dec_cross_section: the section plane's orb is the one that does not work like the others; its move modes and live state are what is brought onto the common orb
alternative_to:
---
# One orb for every tool, in one or more modes

**Asked (`in_1127`):** "unify all the orbs so they work the same. They should all be a single orb in one or more modes": XYZ arrows that Shift selects for more or less freedom of movement; little panes that always send movement in that plane; information bubbles hidden except for the axis selected; sometimes a second arrow beside an axis arrow for the copy direction or the twist direction (screws, rotate extrude); always the swapper between XYZ and rotate mode (some orbs are in both modes at once); and a click on the blue orb always allows smart select (clicking edges, vertices, objects, faces).

**What the code has (an audit, read only, not yet checked by running anything; `in_1127`):** there is no orb type, only a flat list of handles (`arrow`, `ring`, `orb`) made in several places: `moverHandles` and `gizmoFor` for the tools, `sectionGizmo` for the cross section, `jointHandles` for joints. Shift-holding axes (`lockAxes`, `heldTo`) works for a body's move arrows and the orb's `piv:` arrows only; it is missing for the section, mirror, scale, rotate, repeats, `rev:adv`, joints. There is no pane handle (the panes of `ui/world/panes.ts` are the world planes). Second arrows exist for revolve (`rev:adv:`) and linear repeat (`cnt:`), not circular repeat, sweep or the section. The move and rotate swap is the mode chip for bodies and planes and the sheet's own icon cycle for the section. The section's orb is not an operation, so its blue orb never enters orient mode and a drag on it orbits the camera; its move modes, its rotation (`draggedSection`, `typedSection`) and its bubbles (`sectionEntries`) repeat what the body's orb does.

**The AI's reading and plan, for the human to correct (nothing built):**
1. One description of an orb (the axes it offers, whether it has rings, panes, second arrows and the swapper), built by one function, and drawn, hit-tested, dragged and numbered by the same code for every tool; a tool says which modes and second arrows it has, and no more.
2. Shift on any arrow holds the drag to one, two or three axes (one module for the state and for the held drag).
3. A pane is a handle: a drag on it moves in its plane.
4. The bubbles are hidden except for the axis (or ring) chosen or dragged.
5. A click on the blue orb enters the smart select (the places `orbsnap.ts` knows, plus edges, vertices, faces and bodies) for every orb.
6. **Order:** the cross section first (given the common pose, so it uses the same drag, Shift, bubbles and orb click), then the shared Shift module, the shared drag and the shared bubbles, then the orb click everywhere, then mirror, scale and repeats, then panes and second arrows for circular repeat and sweep.
**The three questions (the human took the AI's recommendation, `in_1128`, without answering them; these are the AI's defaults, to be changed on a word):** the tools that have both a place and a turn (move, a sheet, mirror, revolve, the repeats) show the XYZ arrows and the rotate rings together with the swapper between them; scale and the push or pull arrows are XYZ only. The sheet's move icon keeps going through its modes (the arrow along the normal, the mover, across X, Y, Z) until the common swapper is built, and then the first two become the swapper. A pane is on every orb in its XYZ mode.

**Built (stage 1a, `in_1128`):** on the sheet's mover, **Shift or a click on an arrow** holds a drag to axes with the orb's own words (`heldWords`: "the plane moves in the XY plane only"); **the blue orb is dragged to move the plane** (it turned the view before), held to the axes, sticking to the places `orbsnap.ts` knows and lining up with them (`orbPlace`); **a click on the blue orb selects it, and a corner, an edge midpoint or a face clicked then puts the plane there** (a face: lying on it, the normal outward; an edge: across it), a second click lets it go. `test/sectionorb.test.ts` (3). **Not yet:** the section's bubbles still follow `sectionEntries` (not the one rule), the plane's rotate rings do not take Shift, the orb is not drawn lit while selected, no pane handle, no second arrows for circular repeat or sweep, the other tools' orbs (mirror, scale, repeats) not moved onto the shared code. Not seen in the browser.

## Rationale

Every orb having its own handles, drag, bubbles and click means each rule the human gives (Shift to hold axes, snapping, bubbles) has to be built again for each, and has been: the section orb has none of them. One orb whose tools only choose its modes makes a rule given once true everywhere, and makes the next tool cost its modes, not its handling.
