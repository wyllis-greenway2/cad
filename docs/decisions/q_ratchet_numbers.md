---
id: q_ratchet_numbers
kind: question
status: open
origin: ai-unreviewed
human_input: in_697
date: 2026-11-17
depends_on:
alternative_to:
---
# Where do the ratchet's default numbers come from, and are they right?

`dec_ratchet` builds a ratchet wheel and pawl from conventions remembered, not read in a source this session: the tooth depth (0.4 of the circular pitch), the face's hook (0 to 30 degrees, none by default), the pawl's pivot on the tangent at the contact, the contact over part of the face, the pawl's arm (0.7 of the diameter) and width. They are defaults a person can change, not standards (there is none for a ratchet tooth). Open: whether to find sources (Machinery's Handbook, a ratchet maker's catalogue) and write them in, as the pulleys' numbers were (`q_timing_pulleys`), and what defaults a printed part wants (a deeper tooth, a hooked face, a thicker pawl). Not decided; the human has not answered.

## Rationale

The defaults decide whether the first ratchet a person makes works; they should be right or said to be a guess.
