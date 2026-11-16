---
id: dec_settings_page
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_543
date: 2026-11-16
depends_on:
  - dec_menu_picking: the ⋯ list is where the page is opened from, and its rows are the short ones that decision set
alternative_to:
---
# A settings page under the ⋯ list, and every menu icon always there

`in_543` asked for two things. **(1) Nothing is left out of the menus:** every bubble of the ring and every row of the ⋯ list is always there; one that cannot be applied now is only unclickable (dimmed), and says why when it is pressed (`dec_menu_picking`). **(2) A real settings page** under the ⋯ list for the special view options, the trackpad, mouse and keyboard, with the key bindings shown and the person able to set their own, and the number system (inch or mm for now).

**Built:**
- *Always present:* the relations of the Constraints category that fit the selection but cannot be applied (for example all parts are references) are shown dimmed with their reason, not dropped; the ⋯ list's Reapply mates, Clear cache and Build rows are always listed, dimmed when they cannot be used. (A relation that does not fit the kind of the selection at all, such as "On circle" for a line, is still not listed: the table has about forty of them and most never fit; what the selection allows is all there.)
- *The page* (`ui/settings.ts`, a full-window page opened by **Settings…**, closed by Done or Esc): **Numbers** (millimetres or inches), **View** (edge lines shown or hidden, the black lines along a body's edges), **Mouse and trackpad** (what a scroll does: automatic, pans or zooms; the trackpad pan speed: low, medium, high), **Keyboard** (every action the keyboard can start, with its keys; click a key to press another, × to take it away, a dashed button to add one; a key another action has moves to the new one and the page says so; numbers, Tab, Enter, the arrows, Space and W A S D are kept for typing and the view and cannot be bound; "Put every key back" restores the usual). Each change is made and kept as it is made (`cad.keys`, `cad.units`, `cad.outlines`, `cad.scrollMode`, `cad.panScale`). The three rows Edge lines, Pan and Scroll left the ⋯ list for the page.
- *Key bindings* are data in `settings.input.keys` as before (`keymap.ts`); the page's logic is `interaction/preferences.ts` (pure), only the changed bindings are kept so a key the app gives later is not hidden by an old copy.
- *The number system* (`shared/units.ts`): the model is always millimetres; only what is shown and typed for a **length** changes: the number bubbles of operations, tools and repeats (`inUnits` in `entry.ts`: a live value is converted, what was typed already is in the system in use), a typed length (`typedLength` at each place a typed length is read: operations, tools, repeats' distances, the revolve's advance, the loft's distances, the orb, mirror and section places), the dimension bubbles of constraints and measures, the History's steps; an arrow key steps a tenth of a millimetre or a hundredth of an inch. Angles, counts and scale factors are never converted. Inches show four places, millimetres two.

**Not converted yet (said plainly):** areas (the `mm²` of an area measure), the file names and sizes of Import and Export (their dialogs have their own unit choice and do not follow this setting), the tape measure's text if it shows one outside a bubble, and the clearance row of the ⋯ list (it still says a number of millimetres). The grid has no labels.

## Rationale

The human wanted one place for the choices that are about the person and not the model (look, devices, keys, units), and a menu that does not change shape under their hand: an icon that comes and goes cannot be learned, one that is dimmed can. Converting only at the edge (what is read and what is typed) keeps the model, the files and every test in millimetres, so the number system can be added to without touching the kernel or the steps.
