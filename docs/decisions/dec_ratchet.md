---
id: dec_ratchet
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_767
date: 2026-11-17
depends_on:
  - dec_spline_and_cams: the ratchet is one more shape of the cam tool (a generator that writes ordinary drawn parts), drawn with the same tool, box, names and tests
  - prin_manufacture_agnostic: nothing here is for one making route (no print clearance, no kerf); a person adds play by the pawl's width and the pivot hole's size
alternative_to:
---
# A ratchet wheel and its pawl, as one generator of the cam tool

**Approved at `in_767`** as recommended in the answer to "what are some other helpful mechanical shapes" (a decision entry first, then the generator). There is no ISO standard for a ratchet tooth; the rules below are the usual conventions (Machinery's Handbook and the makers' catalogues, as remembered, not read this session): the numbers are defaults a person can change, and `q_ratchet_numbers` is open about sourcing them.

- **The wheel (external, one way).** A sawtooth: `teeth` points on the outside circle, each with a long ramp rising round the wheel (counter-clockwise) to the tip and a short **face** dropping back to the root circle. The numbers: Teeth (an integer, 20 by default), Diameter (outside, from the pointer), Depth (from tip to root, mm; 0.4 of the circular pitch π D / teeth by default), **Hook** (the face's lean from radial, degrees; 0 is a radial face, up to 30 an undercut that holds the pawl in; 0 by default) and Hole (the shaft's bore, a fifth of the diameter by default). All sides are straight lines.
- **The pawl.** A lever drawn with the wheel: its tip rests on the face of a tooth over a part of the face's length, its other end is a rounded boss with the pivot hole. The arm runs **along the tangent to the wheel at the foot of the nose** (counter-clockwise from there), its lower edge on that line and the boss resting on it, so the load from the tooth runs along the arm (the arm in compression) and the pawl is not pushed out of the gap. Where that tangent would pass through the next tooth, the arm is turned outward from it, by the least angle that clears (up to 40 degrees), as real pawls do. The nose is as deep as the gap lets it be: no part of the pawl lies across the wheel's outline (checked by segments, not only points); when none can be found the reason is given (the arm too short, the width too big). Numbers: Pawl (the arm's length from the contact to the pivot, mm; 0 for no pawl; 0.7 of the diameter by default), Width (of the boss, mm; twice the depth at least a tenth of the diameter), and the pivot hole (half the boss diameter).
- **Which way it turns.** The wheel is free to turn clockwise (the ramps ride up under the pawl) and held against counter-clockwise (the face is against the pawl). **Angle** (degrees from +x) turns the whole drawing about the shaft, so the engaged tooth is where the person wants it.
- **Kept as a record** (`in_768`). Like the cams, a ratchet is a record with its numbers (`dec_spline_and_cams`): its parts (a closed outline of lines for the wheel, a closed outline of lines and one arc for the pawl, circles for the bore and the pivot) are made from the record and are locked; Edit cam changes its numbers, Move and Turn move the record.
- **Not yet:** an internal ratchet (teeth pointing in), a two-way (symmetric) ratchet, a linear ratchet (a rack of teeth, a cable tie), a face ratchet, a flexing (printed spring) pawl, the pawl's return spring.

## Rationale

A ratchet is a shape with a handful of numbers and no standard tooth, so it belongs beside the cams: a generator that writes drawing the person can then change. The pivot on the tangent at the contact is the usual rule for a pawl that must not be forced out of the gap; the face's hook is what keeps a loaded pawl seated. The wheel's tooth depth and the pawl's size are conventions, not standards; they are defaults to change, and are listed as open in `q_ratchet_numbers` rather than presented as settled.
