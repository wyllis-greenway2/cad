---
id: dec_three_surfaces
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1598
date: 2026-11-26
depends_on:
  - dec_helpers_one_rule: what the info bar offers is the same predicate (`offerable`) as what the helpers offer
  - dec_dimensions_measure_then_lock: the numbers (live or locked, typed as you go) are items of the info bar
alternative_to:
---
# Three surfaces for everything: the menu, the notices, the info bar

**The AI's proposal, not decided.** The human's picture (`in_1598`): the program has only three handles. **The circle menu** (what can I do), **notifications** (what is happening, what do you need to do next), **the info bar** (what is true of what I am working on, and what could I add). No tool, operation or feature grows a panel, pill, chip or bubble of its own. This entry says how to build that lean, and what rules make a future feature fit.

## The rules

1. **The menu.** One list of items, all always shown as icons, all always selectable, the words in a tooltip on hover. It has groups (sketch tools, operations, constraints), no rows that appear or vanish. A click on an item **arms** it: a badge of its icon follows the pointer. **A right click disarms** (with nothing armed, it opens the menu); Esc does the same. Nothing about the menu is a special case of any item.
2. **An item is a tool, and every tool is the same thing: a list of needs and what to do with them.** `{ id, icon, label, group, needs: Need[], run }`. A need is what must be picked, in order, with the sentence that asks for it: `{ pick: "face" | "edge" | "line" | "circle" | "point" | "part" | "region" | "body" | "place", many?, ask: "Select the face to extrude" }`. A drawing tool's needs are places (the first corner, the opposite corner); an extrude's is a region; a loft's is two or more profiles; a **constraint is a tool whose needs are the kinds of parts the relation takes** (`RELATIONS[kind].parts`), so the constraints in the menu need no code of their own.
3. **Arming a tool is one rule.** The needs are met from what is **already selected** first, in order; if all are met the tool **runs at once**. Otherwise the first unmet need is asked in a **persistent notice** ("Select the face to extrude") and each pick (a click selects, as always) meets the next; the notice is replaced by the next need's, and goes when the tool runs or is disarmed. A tool that can be run again (the drawing tools) stays armed after it runs, until a right click.
4. **When a tool runs** it either finishes at once (a constraint is applied), or it becomes the **subject** of the info bar for as long as it is under way (an extrude with its distance, a figure being drawn with its numbers): Enter applies, a right click or Esc cancels. The thing it shows in the world (a ghost, an arrow, guides, the figure) is drawing in the model, not interface.
5. **The info bar.** One bar, standing by its subject (the selection; or the operation or figure under way). **Right: what could be added**, only what is `offerable` (new, or true as drawn and not yet said, and the solver would accept it): the relations that fit, the near ones (relations with one other part that already hold, as the old app's "near" suggestions), the alternatives of an operation (Extend, Offset), Apply. **Left: what is so**: the constraints that touch the subject, its numbers (live with an open padlock, locked with a closed one, typed over by clicking or just typing digits), and facts. **A click moves an item across**: a suggestion clicked becomes applied and stands on the left; an applied relation clicked is taken away and, if still offerable, goes back to the right. Nothing is timed, nothing asks a question, nothing shows a check: the move is the answer. Hovering an item lights the parts it is about (amber, `dec_helpers_one_rule`).
6. **Notifications.** One stack at the bottom, one API for the whole page: `notify(text, { kind, persistent?, ttl? })` returns a handle that can be cleared. **Persistent** notices belong to something that is going on (a tool's prompt, an operation's words, a busy engine) and are cleared by their owner; **temporary** ones report what happened (saved, an engine problem, a refusal's words) and fade. A refusal is both: the parts that hold it back flash red in the model, and the notice says why. Every message the page shows today goes through it (the bottom line, the sketch's message, the pill's words, the step list's "making...").
7. **Back out one level, always:** a right click or Esc disarms the tool; with none, it clears the selection; with none, it closes the menu or opens it.
8. **How a feature slots in:** one registry entry (its needs, its run, the items it puts on the info bar), its sentences, and, if it needs a new kind of pick or a new kind of item, that is added to the framework once. A feature never draws interface.

## What goes (the code it replaces)

`opbar.ts` (the pill at the top), `chipdraw.ts` (the chip by the pointer), `bubbledraw.ts`, `bubbleplace.ts`, `interaction/bubbles.ts`'s drawing side and `offers.ts` (the bubbles, the offer with a question mark, the timer, the check), the note in `main.ts`, the sketch's message, `menu.ts`'s `createOrientBar`, and the per-tool prompts. The helper bar becomes the info bar. The step list panel (top left) is the one other surface: proposed to become the info bar's content when nothing is selected, or to stay as the history view (a question).

## Order to build it (each step leaves the page working and deletes what it replaces)

1. **Notifications**: `notify.ts` (the stack, temporary and persistent) and its drawing; every message goes through it; the bottom note, the sketch's message and `say` go.
2. **The info bar**: facts left (the bubbles' constraints and numbers), suggestions right (`offerable`, the near ones), a click moves an item across, typing digits goes to the number; the bubbles, the offers and the chip go.
3. **Tools and the menu**: the registry, arming with needs from the selection, the badge, right click disarms, the constraints group in the menu (refusal: red flash and a notice); the pill and the orient bar go.
4. **Move each existing tool and operation to the registry** (line, rectangle, circle, arc, trim, extrude, push and pull, round, chamfer, constraints), one at a time, with a page check each.

## Open questions for the human

- An operation is applied by Enter or by an Apply item at the top of the info bar's right (the check of the old pill); a right click cancels it (today it applies a pull). Right?
- The step list panel at the top left: keep as the history view, or make it the info bar's content when nothing is selected?
- When nothing is selected and nothing is armed, is there no info bar at all?

## Rationale

Each feature built so far (the pill, the chip, the bubbles, the offers, the bar, the menu) was a right answer to one need and a second place to learn, to keep in step and to get wrong; the same need (what is true, what could I add, what do I do next) was answered three ways. Three surfaces with fixed rules, and a registry whose entries are data, make a new feature a few lines and the page predictable, and let the checks be written once against the framework.
