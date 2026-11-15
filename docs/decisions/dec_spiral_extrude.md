---
id: dec_spiral_extrude
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_427, in_428, in_429, in_430
date: 2026-11-15
depends_on:
alternative_to:
---
# Revolve with turns and a pitch (a spiral extrude)

**Asked for (`in_427`):** a rotate-extrude arrow, a curved arrow that is a full circle so the turn can go past 360 degrees, and a second arrow at right angles to the turning direction that makes it advance, so the same operation revolves a figure (a ring, a bowl) or spirals it (a screw, a spring). Nothing is built; the choices below are the AI's proposal and are the human's to make.

**Proposal.**
1. One operation, **Revolve**, on a closed figure (or a selected face). Its numbers: **Angle** (degrees, any size; 360 is a full turn, 720 two) and **Advance** (mm along the axis for the whole angle, 0 for a plain revolve; the pitch is the advance divided by the turns).
2. **Arrows:** a circle arrow (a full ring, handle on it, drawn round the axis; its drag sets the angle, past one turn it keeps counting) and a straight arrow along the axis (its drag sets the advance). Both can be typed as the other operations are (Tab goes between them).
3. **Axis** (the human's choice, below). Default: the figure's own edge nearest the pointer or a world axis lying in the figure's plane.
4. **Kernel:** a plain revolve of up to 360 degrees is the kernel's own revolution. Past 360 with no advance the extra turns lie on the first (the same body), so the angle is limited to 360 until there is an advance. With an advance the figure is swept along a helix about the axis (the kernel's pipe shell on a helical spine, with the profile kept at the same angle to the axis); the result must not cross itself: an advance per turn smaller than the figure is wide along the axis is refused with the reason.
5. **As a step** `revolve` with `angle`, `advance` and the axis named by what it is (a line of the sketch, a world axis); a change of the number changes the step, as every other operation does (`dec_modifications_are_steps`).

**Decided (`in_428`):** the axis is a line **in** the figure's plane (A); a **circle arrow** sets the angle and a straight **arrow along the axis** sets the advance. The twist about the normal (B) is not built. **Choices still open:**
- Where the curved arrow lies (a ring round the axis, standing on the figure).
- Whether the turn past 360 with no advance should be allowed at all (it changes nothing).

**Built (`in_428`).** Select a closed figure (and, if you like, a line in its plane) and choose **Revolve / spiral** in the Shape menu. The figure turns about **a line in its plane**: the line selected with it, a world axis in its plane, or one of its own sides (a chip "Axis:" chooses; a line the figure crosses is not offered). Two numbers, typed or dragged, Tab between them: **Angle** (any size, either way; the ring round the axis keeps counting past one turn) and **Advance** (mm along the axis over the whole angle; the arrow along the axis; none for a plain revolve). The step is `revolve` (`angle`, `advance`, the axis as numbers); the kernel's `revolve` op makes a plain turn of up to 360 degrees by revolution and a spiral by sweeping the figure along a helix about the axis (exactly a screw motion: the volume equals area times the path of the figure's middle, to four figures). Refused with the reason: a turn past 360 degrees with no advance, an advance a turn that is less than the figure is wide along the axis (the turns would overlap), an axis outside the figure's plane or through the figure. Whether it adds, cuts or stands apart is decided when it is made, as for an extrusion. **Not built:** a figure with holes or several figures at once; the twist about the plane's normal (B).

## Rationale

Revolve is in the blueprint's operation list (`docs/origin/CAD_Blueprint.original.md`, "Revolve sketch around axis") and threads are a stated goal; a spiral is a revolve with an advance, so one operation with two numbers covers rings, bowls, screws and springs. Accepted with the axis and arrow layout chosen by the human (`in_428`).
