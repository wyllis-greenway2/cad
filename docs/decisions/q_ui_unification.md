---
id: q_ui_unification
kind: question
status: open
origin: ai-unreviewed
human_input: in_544
date: 2026-11-16
depends_on:
alternative_to:
---
# One way to do each thing in the interface: an audit and a proposed order

`in_544` asked how to make an operation's option buttons usable in game mode, and for an audit of what can be unified: notifications, refusal rules, buttons and bubbles, the menu, apply and cancel, the operation's options, the mobile bar, "Add more", and the many kinds of X Y Z orbs. **Nothing here is decided: this is the audit (what the code does today, read from the code, not tried in a browser) and the AI's proposal for the human to answer.**

## What is there today
- **Game mode:** the crosshair already presses whatever page element is under it (`dom-input.ts` `underCrosshair`, hover included), and Alt frees the real pointer. What cannot be pressed is what stands at a fixed place on the screen (the operation pill at the top, the option chips, the undo bar): the crosshair is always at the middle and the view moves, not the chip, so it can never be aimed at one.
- **Messages (about nine ways):** the status line (`session.message`), the refusal chip with "Delete constraint to proceed" (`flash`), the helper bubble on an arrow, the hint icons, the busy sign, the suggestion row, the similar chip, the pressed-and-held tooltips, and the number chips.
- **Pills and chips (about fifteen files):** `toolchip`, `chip`, `facekindchip` (also used for size kinds and loft kinds), `similarchip`, `addchip`, `cutparts`, `sheetchips`, `undobar`, `refusalchip`, `suggest`, `resetview`, `modeswitch`, each with its own look code except those sharing `look.ts` (`PILL`, `choiceRow`).
- **Apply and cancel:** an operation applies with Enter, a right click on blank space, or the check of the top pill, and cancels with Esc or the cross (`doApply`, `pointer.ts`); a **sketch tool** stays on until a right click or the cross and its check only means "done"; a **repeat** applies as an operation does; **picking** (an operation chosen first) applies on the same keys; **cut** has its own pill ("Cut"); the **mover** has "Orient the mover"; the **dimension** operation has no pill at all (`frame.ts` `confirm`); on touch the check is hidden for an operation (`toolchip.ts`, `in_286`: "tap away to apply"), which is why a rotation extrude on a phone has no check. Chip choices (push pull kind, size kind, loft kind, select-similar rules) take effect at once.
- **Refusals:** a change that would break a constraint is refused with the flashing and the "Delete constraint to proceed" chip only on the paths that go through the refusal (`flash.retry`); other paths just say a sentence in the status line.
- **Menus:** the ring's categories and operations are always there (dimmed); since `in_543` the relations that fit the selection stay too, but the relations that do not fit its kinds are absent, so the Constraints list is empty (one placeholder) until something is selected.
- **X Y Z handles:** five handle kinds (`arrow`, `double`, `arc`, `ball`, `scale`) in about nine families: the mover (arrows `move:`, rings `rot:`, orb `pivot`, and the same with `piv:` when the orb is selected), the revolve's orb, rings, position arrows and spiral arrows (`rev:*`, `piv:*`), the mirror's orb and arrows, the linear repeat's count and distance arrows with an orb, the circular repeat's pivot arrows, the scale arrows, the push pull arrow, the fillet's double arrow, the section plane's arrows and rings and the sheet's own arrow, and the joint handles.

## Proposed (for the human to answer)
1. **Game mode:** do not put buttons in the world. Give the operation pill the options too (below), and make **Tab and Shift+Tab step through the options** of the open operation (each step chooses it, so the chip's choice is made without aiming), with Enter / right click / Esc as now. This works in game mode, on a keyboard alone, and needs one mechanism, not one per chip. Tab currently moves between typed number fields; the fields would take another key (for example the up and down arrows, which already change a value) or Tab would step options only when the operation has options.
2. **One operation bar** (the top pill, drawn by one component): operation icon, its options (the chips that sit beside the number today), Apply (check) and Cancel (cross) **for every operation, tool, repeat, picking, cut and mover state**, on every device; on a phone it moves to the bottom, joined with undo and redo. Apply stays Enter, right click on blank space, or the check; cancel Esc or the cross; a sketch tool keeps "stays on until applied or put away".
3. **One notification path:** every message and refusal goes through one `notify({text, kind, anchor?, action?})` in the interaction layer and one renderer (a line at the bottom, or a bubble at an anchor, with an optional button such as "Delete constraint to proceed"); the helper, hint and status line become kinds of it. **One refusal rule:** any change refused because of a constraint offers "Delete constraint to proceed", whichever tool made it.
4. **One bubble and one button:** a single bubble component (icon, number, options, cross) and a single round button look (`look.ts` grows to hold it), so the files above shrink to descriptions.
5. **Menu:** every constraint and mate the table knows is in the Constraints list always, dimmed unless it fits the selection (about forty, grouped by what they act on; the ring would need sub-rings), so the ring's shape never depends on the selection.
6. **Mobile:** "Add more" leaves the screen and becomes a mobile-only bubble in the finger menu (it is already `select:add` in the Select category; only the pill goes).
7. **Handles:** reduce to three kinds (an arrow with a tip, a ring, an orb), one family per job (move, turn, size, count), and one drawing and one drag code; the revolve, mirror, repeat and mover would be the same family with a different set of axes.

**Suggested order (smallest first, each testable alone):** 6, then 2 with 1, then 3, then 5, then 4, then 7 (the handles are the most work and touch the picking and drag tests).
