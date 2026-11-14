// The input recogniser (`prin_input_agnostic`): raw device records in, intents out. One table of gestures per device kind (`input/`); nothing after this mentions a device.
//   mouse and pen: click (double and triple counted by time and place), right click = menu, right-drag or Alt + left-drag orbit, the left button held still for a while then dragged draws a selection rectangle, middle-drag or Shift + right-drag
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
  const touch = createTouch(I, countClick, () => (drawing ? I.drawTouchSlopPx : I.touchSlopPx), () => drawing);
  let space = false;
  // W A S D (`in_300`): while any is held the view moves with them (time passes: a tick) and the pointer, with no button down, turns the view about the eye
  const fly = new Set<string>();
  let flyAt = 0;
  let last: [number, number] | null = null;
  let buttons = 0;
  const mouse = createMouse(countClick, () => space, () => (drawing ? settings.view.drawClickMovePx : settings.view.clickMovePx));

  function feed(e: RawInput): Intent[] {
    switch (e.kind) {
      case "key":
        if (e.key === " ") { space = e.down; return []; }
        if (/^[wasd]$/i.test(e.key) && !e.mods.ctrl && !e.mods.alt) { const k = e.key.toLowerCase(); if (e.down) { if (!fly.size) flyAt = e.t; fly.add(k); } else fly.delete(k); return []; }
        return e.down ? keyIntents(e, I) : [];
      case "wheel": return scroll.wheel(e);
      case "gesture": return scroll.gesture(e);
      case "leave": return [{ type: "hoverEnd" }];
      case "tick": {
        const walk: Intent[] = fly.size && e.t > flyAt ? [{ type: "walk", forward: (fly.has("w") ? 1 : 0) - (fly.has("s") ? 1 : 0), right: (fly.has("d") ? 1 : 0) - (fly.has("a") ? 1 : 0), dt: Math.min(0.1, (e.t - flyAt) / 1000) }] : [];
        flyAt = e.t;
        return [...walk.filter((w) => w.type === "walk" && (w.forward || w.right)), ...touch.tick(e.t), ...mouse.tick(e.t)];
      }
      default: {
        if (e.device === "touch") return touch.pointer(e);
        if (e.kind === "down") buttons++; else if ((e.kind === "up" || e.kind === "cancel") && buttons > 0) buttons--;
        const turn: Intent[] = e.kind === "move" && fly.size && !buttons && last ? [{ type: "swivel", dx: e.x - last[0], dy: e.y - last[1] }] : [];
        last = [e.x, e.y];
        return turn.length ? turn : mouse(e);
      }
    }
  }
  return { feed, setDrawing: (on: boolean) => { drawing = on; }, setTouchHelper: touch.setHelper, setScrollMode: scroll.setMode, get scrollMode() { return scroll.mode; } };
}
