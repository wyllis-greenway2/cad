---
id: dec_mark_placement
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1649, in_1650
date: 2026-11-26
depends_on:
  - dec_marks_on_things: this says where each mark stands and when it speaks; that entry says which marks show and what a mark is
alternative_to:
---
# When and where marks show: quiet, in the drawing, loud on hover (a draft of the human's direction, `in_1650`)

The human's direction (`in_1650`): quiet marks that light up on hover are good, for offers too; an offer's arrows only on hover; **no pills** (marks never cluster, they are part of the drawing); an angle's mark in its corner (a square if square, a curve and the degrees if not); on-line and tangent near the junction; a whole-line number on the line (a length with a dashed dimension line and arrow tips); a circle's size on a dashed radial line, the bubble on it; thin grey dashed leaders with arrow tips (yellow when offered) to where a mark points, ending in a small bubble at the nearest free place. **The rest of this entry is the AI's draft of the rule set that follows, not yet seen or approved.**

## When
1. A mark is quiet by default: small, pale, its icon only. An offer is the same in yellow. No arrows, no words.
2. Pointing at a mark (hover; on touch, a first tap) makes it strong, lights the parts it is about, draws what it measures or would move (a dimension line, an offer's dashed arrow) and says it in a sentence. Pressing applies it (offers) or takes it away (an applied one).
3. Which marks exist at all is unchanged (`dec_marks_on_things`): a selection shows its constraints, an offer near it, a refusal always.
4. A mark that cannot fit at the zoom (its part is smaller on screen than the mark) is a dot until pointed at.

## Where (by what the constraint is about)
| about | stands at | draws, when pointed at |
|---|---|---|
| two lines at an angle (square, angle) | in the corner, inside the angle: a small square if square, an arc and the degrees if not | the two lines lit |
| parallel, level, upright, equal-ish marks of one line | on the line near its middle, a tick | the line lit |
| a point on a line or circle, tangent, coincident, midpoint | at the junction, a step off the geometry along the way that is clearest | both parts lit |
| a length or distance of one line, two points | on the line, as a dimension line a little off it with arrow tips, the bubble on it | the two ends lit |
| a circle's size | a dashed radial line from the centre to the edge (in the freest direction), the bubble on it | the circle lit |
| a point to a line | a short dashed line square to the line with arrow tips, the bubble on it | |
| fixed | at the point, a padlock | |
2. A leader (thin grey dashed, an arrow tip at the feature, yellow when offered) is drawn only when the bubble cannot stand on its feature: it goes from the feature to the bubble.

## Placing without a pill
Each mark has a first place (the table). If it collides with a mark or with the drawing, it moves along the clear way out in small steps (a leader appears once it is a few pixels from its feature); at one junction several marks fan out round it, kept in a fixed order by kind so they do not swap as you move. A mark keeps its place while you hover and zoom (it is placed in the drawing with a pixel offset, not re-found each frame). Offsets a person dragged stay (`dec_marks_on_things`).

## Open (to ask)
Touch has no hover: a first tap on an offer previews (the arrow, the lit parts), a second applies? During a drag the hints show at once (the person is moving it now). Whether an unlocked measured number (a line's length, not yet a constraint) shows as its dimension line when selected, or only a plain bubble until pointed at.

## Rationale
The human's own direction; the rest follows from keeping what a mark belongs to visible in the drawing rather than in a list.
