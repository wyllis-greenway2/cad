---
id: q_ratchet_numbers
kind: question
status: open
origin: ai-unreviewed
human_input: in_767
date: 2026-11-17
depends_on:
alternative_to:
---
# Where do the ratchet's default numbers come from, and are they right?

`dec_ratchet` builds a ratchet wheel and pawl from conventions remembered, not read in a source this session: the tooth depth (0.4 of the circular pitch), the face's hook (0 to 30 degrees, none by default), the pawl's pivot on the tangent at the contact, the contact over part of the face, the pawl's arm (0.7 of the diameter) and width. They are defaults a person can change, not standards (there is none for a ratchet tooth). Open: whether to find sources (Machinery's Handbook, a ratchet maker's catalogue) and write them in, as the pulleys' numbers were (`q_timing_pulleys`), and what defaults a printed part wants (a deeper tooth, a hooked face, a thicker pawl). Not decided; the human has not answered.

## Sourcing attempt (`in_769`)

Searched, not yet read: the search results are summaries, and the three pages that could settle it could not be fetched (the session's network allowlist does not include their hosts: `engineersedge.com`, `www.globalspec.com`, `online.flippingbook.com`). What the searches say, **unverified against the pages**:

- **Machinery's Handbook (31st edition, "Ratchet Gearing", about page 2295 of the online copy)** gives a pitch formula for ratchets that hold a load (circular pitch P at the outside circumference from the turning moment, face length, allowable stress and tooth count) and a **pawl pivot rule**: where the pawl pushes the wheel (or the wheel pushes the pawl) the perpendicular to the tooth face falls on the pivot's side of the wheel's centre; where it pulls, outside the pivot. That is the "load runs along the arm" idea the arm follows, but it is stated for the perpendicular to the face, not the tangent to the wheel as `dec_ratchet` has it (they agree for a radial face and differ for a hooked one). To read and to check which our construction satisfies.
- **A patent method (US patents on ratcheting tools)** lays the pawl out with the gear's arc tangent to an arc of the pawl's radius; not the same as a pawl arm.
- **Vendor blogs (Firgelli)** give a face angle of 85 to 92 degrees steep, a ramp of 30 to 45 degrees, an undercut of 1 to 3 degrees (another page 2 to 5), and a friction limit (the face lean must stay under about the arctangent of the friction coefficient, about 11 degrees for dry steel). **They disagree with each other and name no source, so they are not used.**
- No source found for the tooth depth as a fraction of the pitch (our 0.4 stays a convention) or for the pawl's size.

So the defaults stay as they are and stay marked as conventions. Next: read the Handbook page (it needs the hosts allowed, or the text pasted), and then either change the pawl's construction to the Handbook's perpendicular rule or say why the tangent is the same.

## Rationale

The defaults decide whether the first ratchet a person makes works; they should be right or said to be a guess.
