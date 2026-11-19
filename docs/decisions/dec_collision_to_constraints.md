---
id: dec_collision_to_constraints
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1123
date: 2026-11-19
depends_on:
  - dec_contact_push: the offer replaces the contact push, so a change to the push changes what can be offered
  - dec_body_mates: the fix makes mates (coaxial, plane, slide) of the kinds that decision defines
alternative_to:
---
# Offer to replace a collision-driven motion with mates ("Fix constraints")

The human asked for a popup when a motion runs on collision ("Collision constraints are slow") with a Fix constraints button that walks through each pushed body, flashes what it will do, and replaces the push with a mate (coaxial, plane, slider, gear) so the motion is constraint-driven and cheap.

Built (`in_1123`, `interaction/fixmotion.ts`): after a play, the kept places of each pushed body say how it moved. A body whose poses all fit one fixed axis gets a coaxial/revolute mate on that axis; one that fits a straight line gets a slider; a pin seen in a hole (`pinInHole`) gets the coaxial mate it names already. Each is shown one at a time (flash the pair, show the mate, Apply / Skip), then the play is run again to compare against the push (within about 1 mm and 3 degrees) before the user keeps it. Not offered where the motion is intermittent or has play (Geneva stops, backlash): say so, keep the push.

What was built, and its limits:
- The offer (a card over the bar: "Collision constraints are slow") shows once a body with no joint has been pushed; **Fix constraints** fits each such body from the kept places (at least 20 steps): a turn about one fixed axis within 1 mm (least squares centre), or a slide along one line. The walk shows one body at a time (lit), with Apply / Skip / close.
- Apply tries the coaxial mate of the body's hole and the pin it is on (`holeAndPin`) and a pivot about the axis found, plays each to where the fit ended, and makes the one that does not jam and turns the body nearest to where the push left it. A difference over 3 degrees is **said**, with undo; a jam refuses. The made mate flashes green; the motion runs again on the new scene.
- Not offered: a slide (a slider needs a rod: said); a body that slides and turns about no one axis (said, with the miss in mm); a constant-ratio link (the fit reports the ratio; no link is made yet).
- Measured on the lever in `lever-pivot-jam`: 804 ms of push to 120 degrees became 1 ms on the joint; the joint turns the lever 23 degrees where the push turned it 15 (the push could slide off the pin, the joint cannot), and the walk says so. `lever-pin-jam` is not a fixed-axis motion (3.2 mm off) and stays on the push.
- The heat: the thread stops when the play is paused; a playing motion is drawn about 38 times a second, not every refresh. Not measured on a real GPU or laptop.

## Rationale

Raised by the human (`in_1122`). Open until they approve the shape above.
