---
id: dec_spiral_extrude
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_420
date: 2026-11-15
depends_on:
alternative_to:
---
# Revolve with turns and a pitch (a spiral extrude)

**Asked for (`in_420`):** a rotate-extrude arrow, a curved arrow that is a full circle so the turn can go past 360 degrees, and a second arrow at right angles to the turning direction that makes it advance, so the same operation revolves a figure (a ring, a bowl) or spirals it (a screw, a spring). Nothing is built; the choices below are the AI's proposal and are the human's to make.

**Proposal.**
1. One operation, **Revolve**, on a closed figure (or a selected face). Its numbers: **Angle** (degrees, any size; 360 is a full turn, 720 two) and **Advance** (mm along the axis for the whole angle, 0 for a plain revolve; the pitch is the advance divided by the turns).
2. **Arrows:** a circle arrow (a full ring, handle on it, drawn round the axis; its drag sets the angle, past one turn it keeps counting) and a straight arrow along the axis (its drag sets the advance). Both can be typed as the other operations are (Tab goes between them).
3. **Axis** (the human's choice, below). Default: the figure's own edge nearest the pointer or a world axis lying in the figure's plane.
4. **Kernel:** a plain revolve of up to 360 degrees is the kernel's own revolution. Past 360 with no advance the extra turns lie on the first (the same body), so the angle is limited to 360 until there is an advance. With an advance the figure is swept along a helix about the axis (the kernel's pipe shell on a helical spine, with the profile kept at the same angle to the axis); the result must not cross itself: an advance per turn smaller than the figure is wide along the axis is refused with the reason.
5. **As a step** `revolve` with `angle`, `advance` and the axis named by what it is (a line of the sketch, a world axis); a change of the number changes the step, as every other operation does (`dec_modifications_are_steps`).

**Open choices for the human.**
- **Which axis?** (A) a line **in** the figure's plane (a sketch line or a world axis): the classic revolve, and with an advance the screw thread (draw the tooth in section, spin it about the shaft). (B) the **normal** of the figure's plane: the figure turns about its own normal while it is extruded (a twist extrude: a star turned into a twisted bar, an off-centre circle into a coil, a lobed section into an auger or thread). The AI recommends **A** (it is what a screw is made from) and B as a second operation later; `in_420` says "normal to the plane", which could mean either.
- Where the curved arrow lies (a ring round the axis, standing on the figure).
- Whether the turn past 360 with no advance should be allowed at all (it changes nothing).

## Rationale

Revolve is in the blueprint's operation list (`docs/origin/CAD_Blueprint.original.md`, "Revolve sketch around axis") and threads are a stated goal; a spiral is a revolve with an advance, so one operation with two numbers covers rings, bowls, screws and springs. Provisional: the axis and the arrow layout are for the human to decide.
