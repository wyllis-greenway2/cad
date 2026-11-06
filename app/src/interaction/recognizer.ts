// The input recogniser (`prin_input_agnostic`): raw device records in, intents out. One table of gestures per device kind (`input/`); nothing after this mentions a device.
//   mouse and pen: click (double and triple counted by time and place), right click = menu, right-drag or Alt + left-drag orbit, middle-drag or Shift + right-drag
//     or Space + drag pan, left-drag on empty space orbits, wheel zooms, trackpad two-finger scroll pans (automatic classifier), pinch zooms.
//   finger: one-finger drag orbits, two fingers pan and pinch, tap, double tap, triple tap, long press = menu. While a figure is being drawn a finger has a cursor like a mouse's pointer (a handle that drags it, a tap on the handle sets the point).
import type { Intent, RawInput } from "../shared/input.ts";
import { settings } from "../shared/settings.ts";
import { createClickCounter } from "./input/clicks.ts";
import { createScroll } from "./input/scroll.ts";
import { createMouse } from "./input/mouse.ts";
import { createTouch } from "./input/touch.ts";
import { keyIntents } from "./input/keys.ts";

export function createRecognizer(opts: { input?: typeof settings.input } = {}) {
  const I = opts.input ?? settings.input;
  const countClick = createClickCounter(I);
  const scroll = createScroll(I);
  let drawing = false; // a drawing tool is armed: a click may wander more before it counts as turning the view
  const touch = createTouch(I, countClick, () => (drawing ? I.drawTouchSlopPx : I.touchSlopPx));
  let space = false;
  const mouse = createMouse(countClick, () => space, () => (drawing ? settings.view.drawClickMovePx : settings.view.clickMovePx));

  function feed(e: RawInput): Intent[] {
    switch (e.kind) {
      case "key":
        if (e.key === " ") { space = e.down; return []; }
        return e.down ? keyIntents(e, I) : [];
      case "wheel": return scroll.wheel(e);
      case "gesture": return scroll.gesture(e);
      case "leave": return [{ type: "hoverEnd" }];
      case "tick": return touch.tick(e.t);
      default: return e.device === "touch" ? touch.pointer(e) : mouse(e);
    }
  }
  return { feed, setDrawing: (on: boolean) => { drawing = on; }, setTouchCursor: touch.setCursor, setScrollMode: scroll.setMode, get scrollMode() { return scroll.mode; } };
}
