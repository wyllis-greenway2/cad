# The push in 2D (a prototype, `in_1096`)

**What it was meant to learn:** whether doing the contact work on the cross-sections of the bodies at one height (flat mechanisms: extruded outlines in layers, which most of these are) instead of on their 3D meshes is quick enough, and accurate enough, to be worth building into `app/src/interaction/contact.ts` as a faster test for bodies that are prismatic.

**What it is:** `run.ts` opens the lever jam file (`app/test/fixtures/lever-pin-jam.cad.json`: the gear with its pin, the free lever on the pin, the other bar as a wall), takes the meshes of the three bodies through the app's own modules, cuts each at a height all three have (z = 10) into a soup of segments, and turns the gear a degree at a time. The lever is in the way of the pin or the bar when a segment of its outline crosses one of theirs; it then moves by the smallest clear slide (64 ways, three distances, halved), else by a turn (alone, then with a slide), the app's own rule, with the slide and the turn about the lever's middle. A grid of cells over each soup keeps a test from looking at segments that are far away. The same file is then played by the app's `contact.ts` on meshes, for time and for where the lever ends. Run from the repository root: `node prototypes/contact-2d/run.ts` (`HINTS=0` leaves out the memory of the last way, `BRUTE=1` the grid).

**What it learned** (Node, one degree a step, 360 steps, a shared CPU):

| | tests | time | a test |
|---|---|---|---|
| 3D meshes, plain core (no hints) | not counted | 16 s | about 0.13 ms (a whole `firstHit`) |
| 3D meshes, with the app's hints | not counted | 1.6 to 2 s | about 0.13 ms |
| 2D segments, brute force, no hints | 205,000 | 26.6 s | 0.13 ms |
| 2D segments with a grid, no hints | 205,000 | 2.4 s | 0.012 ms |
| 2D segments with a grid, last way tried first | 21,000 | 0.33 s | 0.015 ms |

- **A test in 2D costs about a tenth of one on meshes (0.012 ms against about 0.13 ms), but only with a grid.** Brute force on the segments (198 against 198) is slower than the mesh test, whose tree already does the same job. The grid is what makes it quick.
- **It agrees with the 3D answer.** Where the lever's point on the pin is, every 60 degrees: within 0.7 mm and a degree of the app's own solver (24.11, 29.03 against 24.03, 28.73 at 60 degrees; 27.79, 24.96 against 28.17, 25.53 at 360), the turn 30.7 against 31.4 degrees. Not the same numbers: the two break ties differently, and the slide and turn are about different middles (the mean of the section's points, the middle of the box), so the slide and the turn alone cannot be compared, the place of a point can.
- **With only the last way tried first it is wrong (the turn adds up to 107 degrees), and quick.** The prototype's hint takes the last way if it clears, and once a turn it goes on turning without looking at a slide: exactly the case `dec_contact_push` says a hint must not allow (the answer changed, not only the time). The app's hints look at a slide first every fifth step, and a test holds them to the plain answer. In 2D the same rule would be needed; the 0.33 s is not to be believed until it has it.
- **So the 2D test, with a grid and the app's hints, would be about five to ten times quicker than what is built, for flat bodies.** An estimate: 0.2 to 0.3 s for the turn, against 1.6 to 2 s. Not measured with the rule in place.
- **Not tried, and the limits of this:** a body that is not prismatic (a helical or bevel gear, a worm) has no one section: it would stay on the mesh; the height of the section was chosen by hand (the app would take the overlap of the layers of each pair, as `layered` does); a body entirely inside another with no segment crossing is not looked for (the mesh test has the same limit, `surfaceOnly`); rounded outlines made of many short segments (the 20 and 10 tooth gears are about 126 segments each) make the cells busy; the slice of a body in many pieces (a gear and its pin at different heights) is one soup per height, which the push would have to choose between.
- **What I would do with it:** if the speed matters on a real machine after the thread that works ahead, build the 2D test as one more way of answering "is this pose clear?" in `firstHit` for pairs of bodies that are both prismatic, behind the same `contactOptions` switch and held to the 3D answer by the same test. Not before.
