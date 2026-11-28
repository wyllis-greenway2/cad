// What is a click and what is a drag: ONE rule for every press on the page (`in_1732`), so the view, the sketch, the marks, the orb and the bodies agree. A press that has moved less than `dragPx` (a finger, `touchDragPx`)
// is still a click when it is let go; further, it is a drag. Two clicks near each other and soon after each other are a double click. Pure.
import { settings } from "../settings.ts";

/** whether a press that has moved (dx, dy) pixels from where it began is a drag (not yet, or not at all, a click) */
export const dragged = (dx: number, dy: number, touch = false): boolean =>
  Math.hypot(dx, dy) >= (touch ? settings.input.touchDragPx : settings.input.dragPx);
/** whether a click `ms` after the last one and (dx, dy) pixels from it goes on from it (a double click's second, a triple's third) */
export const repeats = (ms: number, dx: number, dy: number): boolean =>
  ms < settings.input.multiClickMs && Math.hypot(dx, dy) < settings.input.multiClickPx;
