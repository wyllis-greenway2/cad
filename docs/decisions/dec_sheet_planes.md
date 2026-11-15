---
id: dec_sheet_planes
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_446, in_447
date: 2026-11-15
depends_on:
  - dec_cross_section: a sheet is the cross section plane made generic; its saved part, its handles and its cut face are that entry's
alternative_to:
---
# Sheets: the cross section plane as a generic plane

`in_446` asked for the cross section plane to be a generic plane, translucent grey like the world panes, with one icon that goes through its modes, an invisible mode, a face to sketch on, a push / pull arrow that moves it, a move icon, and several planes cutting at once; the AI wrote its reading and order as a question and the human said "Go ahead" (`in_447`) with its defaults.

**Built (`in_447`):** a *sheet* is a plane part with `section` (kept as the flag; the cutting is no longer what it is, only one of its modes). **Modes** (`modeOf`, `Plane.cut / flip / hidden`): *cuts the half its normal points to*, *cuts the other half*, *does not cut*, *invisible*; one icon on each sheet goes through them with each press (`sheet:mode:<ref>`, one step, saved with the part, undo takes it back). **Several cutting:** `cutsNow` lists every sheet that cuts; the view clips by all of them (each sheet's cut face is stenciled on its own and cut by the others; the cut-away half of each is a faint ghost), picking leaves out whatever any of them cuts away. **Look:** translucent grey as the world panes (`theme.pane`, `world.paneOpacity`), a little stronger when selected; invisible: fainter and *not pickable* (picking leaves it out); only its icon answers, fading in while the pointer is over the sheet (`ui/sheetchips.ts`). **A face like any other** when not invisible: a click selects it (the click no longer switches its cut), a sketch tool begins on it. **Arrow:** a selected sheet has the push / pull arrow along its normal (`sheet:n`), which moves the plane (nothing is made), with the distance from the origin along the normal as its bubble (typed: field 6). **Move icon** (`sheet:move`, `AppState.sheetMove`): the arrow only, the free mover (arrows along x, y, z, rings, the sphere), the plane across X, across Y, across Z, then back to the free place it left (remembered in the view state). **Menu:** *Plane* (a new sheet that does not cut) and *Cross section* (one that cuts, or puts the selected one away). A new sheet lies through the middle of the part across the axis the camera looks along, or on the flat surface selected.

**Not built:** hatching the cut face where it is also cut by another sheet is done by clipping, not by rebuilding the outline (so a corner where two cuts meet is exact only to the clip); the remembered free place is view state, not saved; sheets as the plane for other tools (a mirror plane, a sweep's plane) are possible now but no tool uses them yet.

## Rationale

Keeping the part kind and the `section` flag, adding `flip` and `hidden`, means saved files and every existing rule about planes keep working; the view and the picking were the parts that had to learn "more than one".
