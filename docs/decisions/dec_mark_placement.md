---
id: dec_mark_placement
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1649, in_1650, in_1654, in_1655, in_1656, in_1657, in_1658, in_1660, in_1661
date: 2026-11-26
depends_on:
  - dec_marks_on_things: this says where each mark stands and when it speaks; that entry says which marks show and what a mark is
alternative_to:
---
# When and where marks show: quiet, an arrow to the spot, loud on hover (a draft of the human's direction, `in_1650`, simplified at `in_1655`)

The human's direction (`in_1650`): quiet marks that light up on hover are good, for offers too; an offer's arrows only on hover; **no pills** (marks never cluster, they are part of the drawing); an angle's mark in its corner (a square if square, a curve and the degrees if not); on-line and tangent near the junction; a whole-line number on the line (a length with a dashed dimension line and arrow tips); a circle's size on a dashed radial line, the bubble on it; thin grey dashed leaders with arrow tips (yellow when offered) to where a mark points, ending in a small bubble at the nearest free place. **The rest of this entry is the AI's draft of the rule set that follows, not yet seen or approved.**

## The simple rule set (`in_1655`, the human's proposal; AI's refinements marked)
Three things, all made from the constraint's own parts, so nothing depends on the kind of constraint:
1. **Hover lights the parents.** The parts the constraint names, strong amber; what applying it would also move, and the lines a named vertex ends, pale amber (`in_1654`).
2. **Every bubble has an arrow to the exact spot it is about** (a thin dashed grey line with an arrow tip; yellow for an offer). The bubble stands in the nearest free place, so the arrow, not the position, says what it is about. *AI refinement:* the arrow is pale until hover (strong on hover) and is left out when the bubble already stands within about 12 px of its spot; several marks at one spot fan out round it in a fixed order by kind, so they do not swap.
3. **An offer's arrow shows the movement:** it joins the two named parts, in the direction they move. *AI refinement:* anything else that applying would move is drawn as paler arrows and the hover sentence says so ("also moves L1"). The preview is the apply itself (`dec_marks_on_things`, `planOf`), so it cannot disagree with what happens.

**The spot** (the one table left; the literal anchor `anchorOf` already finds it): at a vertex, a junction or a touching point, that point; a whole line (level, length), its middle; a circle's edge, a point on it; an angle, its corner.
**Dimensions keep their own drawing** (they are the dimension): a length is a dashed line with arrow tips and the bubble on it; a circle's size is a dashed radial line with the bubble on it.
**Colours** (`in_1658`): blue (teal) is only for what is selected; yellow (amber) is only for what is suggested (an offer, its arrows, its leader). A hover highlight takes the colour of the mark it is for: green for an applied constraint, yellow for an offer, charcoal for a measured number (pale tier: the pale of the same colour). **Nothing changes size on hover** (`in_1657`): a mark, a line, a leader keep their size and width; hover changes colour and opacity only (and shows what was not drawn: the lit parts, the offer's arrows). A tiny part's mark stays a dot on hover. **When:** unchanged: quiet by default (small, pale, icon only, no words); a mark that is tiny at the zoom is a dot until pointed at; on touch a first tap is the hover.

## The minimal version (`in_1660`; built in the app at `in_1661`, see `dec_marks_on_things`; tried in `prototypes/clarity-mockups/minimal.html`)
At rest only small bubbles; **everything else only when one is pointed at**: its arrow to the exact spot, its parents lit in its colour (a named vertex lights the lines that end at it; no pale second tier), its dimension line through the bubble, and for an offer the movement (main arrow between the two named parts, other moves paler). No dots for tiny parts, no fan-out rules (the first free slot round the spot, in a fixed order), no standing dimension lines. Whether the arrows should also be always-on and pale is the thing being compared (`simple.html` has them).

## Open (to ask)
Touch: a first tap previews, a second applies? During a drag the hints show at once. Whether an unlocked measured number shows as its dimension line when selected, or as a plain bubble until pointed at.

## Rationale
The human's own direction; the rest follows from keeping what a mark belongs to visible in the drawing rather than in a list.
