---
id: dec_bubble_layout
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_259
date: 2026-11-10
depends_on:
  - dec_interaction_spec: the bubbles it lists (constraint and number bubbles, the ring, the helper bubbles) are the ones this entry ranks; a change to what they are changes who gives way to whom
---
# When bubbles fall on top of each other: the one behind gives way, by moving first, by fading only if it cannot (draft, for the human to answer)

**Status: a draft written from `in_259`; the stability fix below is built, the rest is not.** Rule 3 of `CLAUDE.md`: it stays `provisional` until the human answers.

## The two things in `in_259`

1. **"That bubble jumps around a lot as you rotate the camera."** Reproduced and fixed. The place a bubble stands was searched again from scratch every frame (up and to the right first, then round, then further out), so as lines and corners swept past it in a turning view, it took the first clear place each frame and hopped between them. On the human's gear, with the 10 curved edges of an extruded tooth selected one at a time and the camera turned in 60 steps each, the bubble moved by more than 6 pixels from its spot 95 times; with the fix, once. How: a bubble **keeps the place it has while that place is still clear** (it moves only when something comes into the way, and then only to a place that is clearer than the one it has), and when it does move it **slides** there over a few frames instead of jumping (`interaction/bubbleplace.ts`, pure, tested in `test/bubbleplace.test.ts`; `ui/bubbles.ts`).
2. **"How should we solve bubbles on top of other bubbles? Make them move out of the way, or the behind one goes transparent?"** My recommendation, not built:

## Recommendation

- **There is a front and a back.** From front to back: (1) the ring and open menus; (2) the number being typed, the tick and cross, the helper bubble ("pull to copy"); (3) the constraint and measure bubbles; (4) hints and suggestion chips. What is behind gives way to what is in front; **the one in front never moves** (it is what the hand is aiming at, and the ring is laid out round the click point on purpose).
- **First choice: the one behind moves.** It slides to the nearest clear place, the same search it already makes against lines, corners and other bubbles, now also against the boxes of what is in front (the search already takes them: `rects` in `placeBubbles`; nothing feeds it yet). It moves only as far as it needs (about 70 pixels at most), and keeps that place while it stays clear.
- **Second choice, when there is no clear place within reach: it fades** to about a third and stops taking clicks until a place clears. A fade alone is not the answer: faded bubbles still clutter, and one you wanted to click goes dead.
- **A bubble that has moved far from its spot gets a thin line back to it** (about 30 pixels or more), so it is still clear what it belongs to.
- **Bubbles of the same rank** side by side as now (they already are, when they share a spot).
- Not proposed: moving the ring (it would feel unstable), or fading the front one.

## Questions for the human

1. Move first, fade only when there is no room (as above), or fade first?
2. The ring in front of everything, as above? (It is transient, so what it covers comes back when it closes.)
3. A line back to the spot for a bubble that has moved far: yes or no?

## Rationale

The jump was a bug and is fixed on its own. How overlapping is resolved is a rule that every bubble family (constraints, numbers, ring, hints) would follow, so it is drafted for an answer before being built.
