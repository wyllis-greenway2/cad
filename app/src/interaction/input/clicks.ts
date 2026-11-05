// Counting clicks in a row (a double and a triple click, `in_070`): the same place within a short time. A finger is less exact, so taps get a wider place and more time.
import { settings } from "../../shared/settings.ts";

export type ClickCounter = (x: number, y: number, t: number, touch: boolean) => number;

export function createClickCounter(I: typeof settings.input): ClickCounter {
  let last = { t: -1e9, x: 0, y: 0, count: 0 };
  return (x, y, t, touch) => {
    const near = Math.hypot(x - last.x, y - last.y) < (touch ? I.multiTapPx : I.multiClickPx);
    const soon = t - last.t < (touch ? I.multiTapMs : I.multiClickMs);
    const count = soon && near ? last.count + 1 : 1;
    last = { t, x, y, count };
    return count;
  };
}
