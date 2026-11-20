---
id: q_view_modes
kind: question
status: open
origin: ai-unreviewed
human_input: in_1378
date: 2026-11-20
depends_on:
alternative_to:
---
# Which few looks may a part of the view have?

The human asked (`in_1378`) for a few looks that are reused, in place of the many there are. Nothing is built yet: this is the list found in `ui/view.ts` and `interaction/frame.ts`, and a proposal to be answered.

**Found.** A body: solid; faded (`fadeBody`: the sketch plane is looked at straight, or bodies are being cut, `in_296`); wireframe (`wireframe`: dark, opacity 0.14; set by the menu, by the mover's orient mode, revolve, mirror, sweep, loft and a pulled hollow wall); hidden. Cuts: the stencil hatch cap; the face coplanar with the cut (a copy of the body's material); the ghosts of what a cut has taken away (grey 0.3 with a rim); the thin parts (`measure.thinColor`); the clash (red 0.72 and 0.32). Marks: the teal fill of what is selected or pointed at, the red of a refusal, orange of a gear. Lines: edges, hidden edges, edges behind a plane, and the lines raised over a cut (`raiseLines`). Several of these copy the material another one has changed, which is how the dark see-through face of `in_1378` came to be.

**Proposal.** Four looks, each one material made in one place and never copied from a changed one: (1) **Solid**: opaque and lit. (2) **See-through**: one translucent look, the same for the faded body, the wireframe body, the ghosts of a cut and the thin parts; edges show through it. (3) **Cut**: the part clipped by a plane, with the hatch on the cut and a face that lies on the cut drawn as Solid. (4) **Marked**: the teal (select, hover, preview) and the red (clash, refusal), laid over any of the other three. The operations then choose a look by name (`solid`, `seeThrough`) instead of setting opacity and colour.

**Asked.** Is this the set? In particular whether the wireframe should be See-through (a body that shows its edges and what is inside) or stay a different dark look.

## Rationale

Several looks are set at one place and read at another, and a change at one (a mirror's wireframe) leaked into the other (the face on the cut). One owner for each look is what stops that.
