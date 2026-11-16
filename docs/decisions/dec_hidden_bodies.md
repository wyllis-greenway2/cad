---
id: dec_hidden_bodies
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_563, in_564, in_571
date: 2026-11-16
depends_on:
  - dec_independent_bodies: a body is named and selected on its own; hiding works on those names
  - dec_sheet_planes: the invisible mode of a sheet (faint, no pointer pick, an icon that fades in on hover) is the model for this
  - prin_history_additive: hiding is saved as a command, like the sheet's modes, so it is undone and redone with the rest; it is not a step of the model
---
# A body can be hidden: drawn very faintly, not interactive, with an icon on hover

**What the human asked (`in_563`, `in_571`):** bodies can be made invisible, as a plane can with its little icon that shows on hover. An invisible body is still ever so slightly visible, so you know it is there; the cursor does not interact with it, except that the icon fades in on hover so the body can be brought back. The Bodies list does the same, can select all or none of the bodies, hide or show all of them, and delete bodies.

**What is built, and the choices that were mine**
1. **Saved as view state, in the history of commands, not as a step.** The command `hideBodies` (body names, hidden or not) is kept in the project and is undone with the rest, as the modes of a sheet are (`placePlane`). A hidden body keeps its steps and everything that refers to it; hiding changes what is drawn and what can be pointed at, not the model.
2. **How it looks.** A hidden body is drawn with a very faint surface (about a tenth of full strength) and faint outline lines, and does not hide what is behind it.
3. **Not interactive.** A hidden body, and its faces, edges and corners, cannot be hovered, selected, boxed, snapped to or sketched on, and hides nothing behind it from the pointer. Hiding a body takes it (and its parts) out of the selection.
4. **The icon.** An eye icon on the body, shown while the pointer is over the body's footprint on the screen (a visible body too: to hide it), fading in and out; one click hides or shows it. It is put by the body's own middle on the screen.
5. **The Bodies list.** An eye on each row (open: shown; crossed: hidden); buttons for select all, select none, hide all, show all; each row can be deleted (the existing delete of a body, with its steps and sketches).
6. **Mates, constraints, steps, the cross section and the export are not changed by hiding.** A hidden body still takes part in mates and in the history, is cut by cross section planes (and so drawn faintly cut), and is **in the export** (hiding is only how it is looked at).

## Rationale

The human wants a model with many bodies to be workable: put one out of the way to reach what is behind it, without deleting it or breaking what is tied to it. A step or a delete would change the model; a saved view state changes only the look. The faint drawing keeps the body findable, as the sheets' invisible mode does; keeping it out of every pick is what makes the body "out of the way". Keeping hidden bodies in the export is the choice least likely to lose work by surprise (the file is the model, not the view); it can be changed if the human wants it otherwise.
