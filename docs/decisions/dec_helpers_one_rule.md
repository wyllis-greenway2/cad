---
id: dec_helpers_one_rule
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1579
date: 2026-11-25
depends_on:
  - dec_hints_place_only: a helper only places; this entry is what a helper is and how it looks
alternative_to:
---
# One rule set for the helpers of drawing

The human asked for "a rule set for what an alignment helper is, and how it should always be styled and represented" so it "always just works" without edge-case rules (`in_1579`). **The AI's proposal, not yet approved by the human.** Built in `next/src/interaction/helpers.ts` (pure, checked by `next/dev/helpers-check.ts`), replacing the first hint code.

**What a helper is.** A *locus*: a point or a line in the sketch plane that the place being drawn is drawn toward, with a *source* (a part of the sketch, or the figure's own first place).

**Where they come from (the whole list).**
1. Every point of the sketch: its level line and its upright line (*aligned*, guided).
2. Every drawn line: its middle (a point).
3. From the first place of the figure (a line's start): the level and upright lines through it; for every drawn line the parallel and the square line through it; for every circle and arc the two tangent lines through it (along the edge when it starts on it).
New sources (a body's corners and round edges, polygon middles, equal length) are added to this list and nothing else changes.

**What they do (the whole rule).** A point within 12 px takes the place. Otherwise the nearest line within 6 px takes it (the foot of the pointer on it), then one more line, not parallel to it, within 6 px of that: the place is where the two cross. Lines from the figure's own start do not act within 12 px of it. No constraint is made.

**How they look (the whole look).** A guided locus is a dashed teal line, 1.5 px, from its source to the place; dash 0.012 of the view's distance, gap 0.7 of it (the old app's). The part a helper is about (the parallel line, the circle a tangent touches, the line whose middle it is) is lit amber (#f2c14e). The place under the pointer being a circle's middle: a dashed cross through it, a little past the rim. Nothing else is drawn; the figure's own line stays teal.

**Differs from the first hint code:** one pixel tolerance for lines instead of 4 degrees for directions and 6 px for alignment; two helpers cross instead of one winning; no "skip alignment when a direction was chosen" case.
**Not built:** hint icons beside the cursor, sources from a body, equal length, on-line and on-circle shown as helpers (a click on them already places on the part), rectangles, circles and arcs taking direction helpers, helpers while dragging.

## Rationale

The old app had one hint function per kind, each with its own tolerance, order and drawing. Every kind is the same thing: somewhere the place is attracted to, shown the same way. Stating it once makes a new source one line and a drawing difference impossible to introduce per kind.
