---
id: dec_menu_picking
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_496, in_495, in_494, in_493, in_463, in_464, in_465
date: 2026-11-15
depends_on:
alternative_to:
---
# Every operation of the menu can be chosen first, and what it needs clicked after

`in_463` asked whether any menu item could always be chosen, the right things being clicked afterwards to complete the operation, and what the edge cases are. **Answer: it works, as a "command first" mode, and it needs these decisions.**

**How it would work (the AI's proposal):** an item that cannot start from what is selected is no longer dimmed; choosing it opens the operation in a *picking* state: a bubble says what it waits for ("click a closed sketch, then the lines of the path"), only things of the kinds it can use are lit and can be clicked, each click adds to the operation's selection, and the operation begins by itself when what it needs is complete (a single target) or on the check, Enter or a click in empty space (as operations now apply on that click, `in_463`). With the right things already selected the item runs at once as today, so nothing gets slower. The revolve already waits this way (`in_435`), and the sketch tools do.

**Edge cases:**
1. *Is a click an argument or a selection?* In the picking state it is an argument; Esc or the cross leaves the state and clicks select again.
2. *Order and roles:* operations with more than one role (sweep: shape then path; mirror: what then across what; loft: order matters) need each pick given its role, in the order the bubble names, or the picks sorted by kind when that is unambiguous (a closed sketch is the shape, lines are the path).
3. *Ambiguity:* a face clicked could mean the face or the body (push / pull, hollow); the state says which it takes.
4. *Nothing to pick:* an item with no possible target in the model (a sweep with no sketch drawn) says so at once instead of waiting.
5. *Operations that take a number:* the number's bubble appears once the picks are complete.
6. *Touch and game mode:* a tap or the crosshair's click is the pick; the helper bubble has to be there for both.
7. *Several picks of one kind* (loft sketches, a repeat's parts): they end on the check, since no count says when it is complete.
8. *Undo and cancel:* a picking state makes no step; leaving it leaves nothing behind.
9. *Menu size:* nothing is hidden or dimmed any more, so the ring shows every operation; the *why not* text becomes the bubble's prompt.

**Built (`in_464`, approved as proposed):** `AppState.picking`: an operation of the menu (the ring no longer dims one for want of a selection; its tooltip says what it needs) chosen without what it needs waits, says what to click, and shows the check and the cross. A click gives it that thing (a world plane under the pointer is background, not a thing). The operations that take one thing begin at once (`finishPicking`); a loft and a sweep take several (each click adds, as Shift does) and begin on Enter, the check or a right click; Esc, or a click on nothing with nothing to start it, leaves the waiting; any tool or operation begun leaves it. With the right things selected the item runs at once, as before. **Only the right kinds are lit and picked (`in_465`):** while an operation waits, the pointer lights only what it can use (`canPickFor`: a sweep takes a closed sketch or a line that is no part of one, a loft closed sketches, any other operation what it can start from alone, tested by starting it on that thing) and a click on anything else leaves it waiting and says why it cannot be used. **Not built:** saying at once that there is nothing in the model it could use; the roles of a mirror's picks (it takes what is selected).

**The ring's words and shape (`in_493`):** every tooltip is one or two words (the reasons are no longer in them: a dimmed bubble pressed says why, and the ring stays open); every category opens even when nothing in it applies now (it is only dimmed); the Delete bubble became the **Actions** category (Undo, Redo, Delete); **All bodies** joins the Select category; Paste has a clipboard icon and Push pull a simpler one (a face and an arrow). The ⋯ menu lost Undo, Redo and Select several (the state and its Shift-click on a tap are gone with it). `menutips.test.ts` checks every label of the ring in six states is at most two words.

**Select several by touch (`in_494`):** *Select several* left the ⋯ menu (`in_493`); its place is **Add mode** in the ring's Select category ("Stop adding" while on), and a pill at the bottom left (`addchip.ts`): "+ Add more" offered on a touch screen while something is selected, "Adding: tap to add or remove · Done" while it is on. While on, every tap is a Shift click (`AppState.adding`, `controller.ts`), so a tap on what is selected takes it out; a tool, an operation, a repeat or a waiting operation keeps its own clicks. Esc ends it, keeping what is selected (the next Esc clears the selection; a tool, operation or repeat that is open takes the first Esc, `in_495`). The form is the AI's reading (the human left it open).

**The ⋯ list's rows (`in_496`):** its rows are one or two words too (Reapply mates, Export body, Clear cache, Share state, All constraints / Key constraints, Clearance 0.2, ✓ Edge lines, Pan medium, Scroll auto / pans / zooms); the long reasons are no longer tooltips: a dimmed row pressed says why (`say:` action, `onBlocked` in `ui/menu.ts`). `menutips.test.ts` checks every row in every state.

## Rationale
It changes how every operation of the menu starts; kept the select-first path so nothing gets slower, and the many-things operations wait for an explicit end because no count says when they are complete.
