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
  // Game mode (`in_300`, `in_302`): any of W A S D turns it on and it stays on until the mouse is clicked (or Esc): the view moves with the keys, and the pointer, with no key needed and no button down, turns the view about the eye.
  // Both are smoothed over the ticks (the keys ease up to speed and down again, the pointer's movement is let out over a few ticks), so neither is chunky.
  const fly = new Set<string>();
  let game = false;
  let idleAt: number | null = null; // (game mode ends at this time, once no key is down)
  let centre: [number, number] | null = null; // (where the pointer is held in game mode: the middle of the screen)
  let flyAt = 0;
  const vel = { f: 0, r: 0 };
  const pend = { x: 0, y: 0 };
  let last: [number, number] | null = null;
  let buttons = 0;
  const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
  const mouse = createMouse(countClick, () => space, () => (drawing ? settings.view.drawClickMovePx : settings.view.clickMovePx));

  function feed(e: RawInput): Intent[] {
    switch (e.kind) {
      case "key":
        if (e.key === " ") { space = e.down; return []; }
        if (/^[wasd]$/i.test(e.key) && !e.mods.ctrl && !e.mods.alt) { const k = e.key.toLowerCase(); if (e.down) { if (!game) { flyAt = e.t; pend.x = pend.y = 0; } game = true; idleAt = null; fly.add(k); } else { fly.delete(k); if (!fly.size) idleAt = e.t + I.gameIdleMs; } return []; }
        if (game && e.down && e.key === "Escape") { game = false; fly.clear(); idleAt = null; return []; }
        return e.down ? keyIntents(e, I) : [];
      case "wheel": return scroll.wheel(e);
      case "gesture": return scroll.gesture(e);
      case "leave": return [{ type: "hoverEnd" }];
      case "tick": {
        const out: Intent[] = [];
        if (game && !fly.size && idleAt !== null && e.t >= idleAt) { game = false; idleAt = null; pend.x = pend.y = 0; } // (a moment after the last key: it fades out of game mode, `in_304`)
        if (game || vel.f || vel.r) {
          const dt = Math.min(0.1, Math.max(0, (e.t - flyAt) / 1000));
          flyAt = e.t;
          const k = ease(dt, settings.input.flyEaseSec);
          vel.f += (((fly.has("w") ? 1 : 0) - (fly.has("s") ? 1 : 0)) - vel.f) * k;
          vel.r += (((fly.has("d") ? 1 : 0) - (fly.has("a") ? 1 : 0)) - vel.r) * k;
          if (Math.abs(vel.f) < 0.005) vel.f = 0;
          if (Math.abs(vel.r) < 0.005) vel.r = 0;
          if (vel.f || vel.r) out.push({ type: "walk", forward: vel.f, right: vel.r, dt });
          const m = ease(dt, settings.input.flyLookSec);
          const [dx, dy] = [pend.x * m, pend.y * m];
          pend.x -= dx; pend.y -= dy;
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) out.push({ type: "swivel", dx, dy });
          if (out.length && game && centre) out.push({ type: "hover", x: centre[0], y: centre[1] }); // (the view moved under the pointer that is held at the middle: what it is over changes)
        }
        return [...out, ...touch.tick(e.t), ...mouse.tick(e.t)];
      }
      default: {
        if (e.device === "touch") return touch.pointer(e);
        if (e.kind === "down") buttons++; else if ((e.kind === "up" || e.kind === "cancel") && buttons > 0) buttons--;
        if (e.kind === "move" && game && e.dx !== undefined) { // (the pointer is held at the middle: the mouse's movement turns the view, with or without a button; a click is a click at the middle, `in_304`)
          pend.x += e.dx * I.flyLookScale; pend.y += e.dy! * I.flyLookScale;
          centre = [e.x, e.y];
          return [{ type: "hover", x: e.x, y: e.y }];
        }
        if (e.kind === "move" && game && !buttons && last) { pend.x += (e.x - last[0]) * I.flyLookScale; pend.y += (e.y - last[1]) * I.flyLookScale; last = [e.x, e.y]; return []; }
        last = [e.x, e.y];
        return mouse(e);
      }
    }
  }
  return { feed, get game() { return game; }, setDrawing: (on: boolean) => { drawing = on; }, setTouchHelper: touch.setHelper, setScrollMode: scroll.setMode, get scrollMode() { return scroll.mode; } };
}
