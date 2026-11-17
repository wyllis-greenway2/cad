---
id: dec_parts_interface
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_710, in_711, in_712, in_713, in_799, in_800, in_801
date: 2026-11-17
depends_on:
  - dec_parts_library: this is the one way a person reaches the families and entries that entry defines
  - dec_gear_tool: the gear tool is the model for one form that covers many forms of one family
  - prin_input_agnostic: the panel works the same by mouse, touch and keyboard
alternative_to:
---
# One "Add part" interface over every standard part family

**Accepted by the human (`in_713`) as proposed by the AI from `in_711`. Nothing built.** The human asked how one interface can produce every standard part. They also said (`in_710`) to build only a few specific parts first, not the whole library.

1. **A family is data plus a generator, and one panel reads all of them.** Adding a family adds a table and a generator; the interface does not change.
2. **The flow:** pick a category, then a family (for example "ISO 4762 socket head cap screw"), fill the form, see the part generated at once as a preview, and place it. A name typed in a search box ("M3x12", "608") goes straight to the family and size.
3. **The form comes from the family's schema.** A family declares its factors (a screw: thread, diameter, length, head; a bearing: designation, or inner diameter, outer diameter and width), the choices each allows (only sizes its table lists) and its defaults. Choices that make no part are not offered, and a number outside what is allowed says why.
4. **One output type:** every family returns the same thing, a solid or a sketch plus its mating points (`dec_parts_library`, point 4), so the rest of the program does not know which family made it. A placed part is a step in the graph holding the family and its numbers, and can be reopened and changed.
5. **First families (`in_710`, a few only):** metric socket head, button head and countersunk screws, hex nuts and flat washers; the matching holes (clearance, countersink, nut trap) come from the same table. Other families (bearings, pulleys, profiles) follow one by one; nothing else is built now.
6. **No logic in the panel** (`inv_no_logic_in_ui`): it shows the schema and sends the choice; the generator and tables live below it.

7. **Where it is, and how it looks (`in_799`, `in_800`, `in_801`, built).** The panel is in the **right-click ring, under Shape, as Models**, with two items in it: **Fasteners** (the Add part dialog) and **Fastener Holes** (the dialog that cuts a receiver into the face selected; dimmed with its reason until one flat face is). They are no longer rows of the ⋯ list. Models is the generic area: other generated or ready-made parts go beside Fasteners later. The dialogs are **visual**: the family is a row of **cards with a line drawing** of the part (its side view and its top view, drawn from the real dimensions), the size and the clearance are **chips**, a **picture of the part at the size chosen** is shown under them (it follows the size, the head and the length typed), and the hole's receiver is a row of cards with its **cross-section** drawn at the size, with a larger one under. The drawings are made in `interaction/partdrawing.ts` as inline SVG, never from what is typed; the dialog's cards, chips and picture are `Field.layout` and the `picture` type (`interaction/transfer.ts`, `ui/dialog.ts`).

## Rationale

The gear tool already shows that one form can cover many forms of one family, and a schema-driven panel is what lets the library grow by adding data. Keeping the output one type means mates, the bill of materials and export work on every part without a special case. Starting with a few families (`in_710`) proves the schema before more are added.
