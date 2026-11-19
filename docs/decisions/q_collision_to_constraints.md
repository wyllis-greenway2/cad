---
id: q_collision_to_constraints
kind: question
status: open
origin: ai-unreviewed
human_input: in_1110
date: 2026-11-19
depends_on:
  - dec_contact_push: the offer replaces the contact push, so a change to the push changes what can be offered
  - dec_body_mates: the fix makes mates (coaxial, plane, slide) of the kinds that decision defines
alternative_to:
---
# Offer to replace a collision-driven motion with mates ("Fix constraints")

The human asked for a popup when a motion runs on collision ("Collision constraints are slow") with a Fix constraints button that walks through each pushed body, flashes what it will do, and replaces the push with a mate (coaxial, plane, slider, gear) so the motion is constraint-driven and cheap.

Proposed shape (not built, awaiting approval): after a play, the kept places of each pushed body say how it moved. A body whose poses all fit one fixed axis gets a coaxial/revolute mate on that axis; one that fits a straight line gets a slider; a pin seen in a hole (`pinInHole`) gets the coaxial mate it names already. Each is shown one at a time (flash the pair, show the mate, Apply / Skip), then the play is run again to compare against the push (within about 1 mm and 3 degrees) before the user keeps it. Not offered where the motion is intermittent or has play (Geneva stops, backlash): say so, keep the push.

Separate, smaller: the heat. Render and worker costs (stop the worker on pause, no redraw when nothing changes, pause when the tab is hidden) are to be measured on a real GPU first.

## Rationale

Raised by the human (`in_1110`). Open until they approve the shape above.
