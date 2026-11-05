// The input recogniser (`prin_input_agnostic`): raw device records in, intents out. One table of gestures per device kind; nothing after this mentions a device.
//   mouse and pen: click (double and triple counted by time and place), right click = menu, right-drag or Alt + left-drag orbit, middle-drag or Shift + right-drag
//     or Space + drag pan, left-drag on empty space orbits, wheel zooms, trackpad two-finger scroll pans (automatic classifier), pinch zooms.
//   finger: one-finger drag orbits, two fingers pan and pinch, tap, double tap, triple tap, long press = menu.
import type { Intent, RawInput, Mods } from "../shared/input.ts";
import { settings } from "../shared/settings.ts";
import { keyAction } from "./keymap.ts";

type S = typeof settings.input;
interface Pt { id: number; x: number; y: number }
type Gesture =
  | { mode: "mouse"; button: number; x0: number; y0: number; x: number; y: number; moved: boolean; action: "orbit" | "pan" | "click" | "menu"; shift: boolean }
  | { mode: "one"; id: number; x0: number; y0: number; x: number; y: number; t0: number; moved: boolean; long: boolean }
  | { mode: "two"; cx: number; cy: number; d: number }
  | { mode: "done" };

export function createRecognizer(opts: { input?: S } = {}) {
  const I = opts.input ?? settings.input;
  let scrollMode: S["scrollMode"] = I.scrollMode;
  let g: Gesture | null = null;
  const touches = new Map<number, Pt>();
  let space = false;
  let lastClick = { t: -1e9, x: 0, y: 0, count: 0 };
  let lastScroll = { t: -1e9, pans: false };
  let lastWheel = -1e9;
  let gestureScale = 1;

  const countClick = (x: number, y: number, t: number, touch: boolean): number => {
    const near = Math.hypot(x - lastClick.x, y - lastClick.y) < (touch ? I.multiTapPx : I.multiClickPx);
    const soon = t - lastClick.t < (touch ? I.multiTapMs : I.multiClickMs);
    const count = soon && near ? lastClick.count + 1 : 1;
    lastClick = { t, x, y, count };
    return count;
  };
  const actionOf = (button: number, m: Mods): "orbit" | "pan" | "click" | "menu" => {
    if (button === 1) return "pan";
    if (button === 2) return m.shift ? "pan" : "menu"; // a right click without moving is the menu; dragging orbits (decided on move)
    if (space || (m.alt && m.shift)) return "pan";
    if (m.alt) return "orbit";
    return "click"; // a plain left press: a click if it does not move, else orbit
  };
  const two = (): { cx: number; cy: number; d: number } => {
    const [a, b] = [...touches.values()];
    return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, d: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };

  /** Does this scroll pan (a trackpad's two-finger scroll, Shift + scroll) or zoom (a wheel notch, a pinch)? */
  function scrollPans(e: Extract<RawInput, { kind: "wheel" }>): boolean {
    if (e.mods.ctrl) return false; // a pinch
    if (e.mods.shift) return true;
    if (scrollMode === "pan") return true;
    if (scrollMode === "zoom") return false;
    // auto: a wheel notch is a big whole number (a multiple of 120 in wheelDeltaY) or counted in lines; a trackpad sends small, fine steps, often with a sideways part.
    // A gesture keeps its kind while its events (and their inertia) keep arriving.
    if (e.t - lastScroll.t < I.scrollNotchMs) return (lastScroll = { t: e.t, pans: lastScroll.pans }).pans;
    const notch = e.unit === 1 || (e.dx === 0 && Number.isInteger(e.dy) && Math.abs(e.dy) >= 50 && (e.wheelDeltaY === null || e.wheelDeltaY % 120 === 0));
    lastScroll = { t: e.t, pans: !notch };
    return !notch;
  }

  function feed(e: RawInput): Intent[] {
    switch (e.kind) {
      case "key": {
        if (e.key === " ") { space = e.down; return []; }
        if (!e.down) return [];
        const a = keyAction(e.key, e.mods, I.keys);
        const typing = !e.mods.ctrl && !e.mods.alt && /^([0-9.\-]|Backspace|Tab|Enter|ArrowUp|ArrowDown)$/.test(e.key);
        if (typing) return [...(e.key === "Backspace" && a === "delete" ? [{ type: "delete" } as Intent] : []), { type: "typed", key: e.key, shift: e.mods.shift }];
        if (a === "undo" || a === "redo" || a === "home" || a === "delete" || a === "save" || a === "open") return [{ type: a }];
        if (a === "cancel") return [{ type: "escape" }];
        if (a === "lookX") return [{ type: "look", plane: "X" }];
        if (a === "lookY") return [{ type: "look", plane: "Y" }];
        if (a === "lookZ") return [{ type: "look", plane: "Z" }];
        if (a === "lookN") return [{ type: "look", plane: "N" }];
        const begin = { toolRect: "rect", toolCircle: "circle", toolLine: "line", extrude: "extrude", round: "round", bevel: "bevel", move: "move", rotate: "rotate", scale: "scale", dimension: "dimension" } as const;
        if (a && a in begin) return [{ type: "begin", name: begin[a as keyof typeof begin] }];
        return [];
      }
      case "wheel": {
        const unit = e.unit === 1 ? 33 : 1;
        if (scrollPans(e)) {
          // a two-finger scroll on a trackpad (or Shift + scroll): the view follows the fingers, like a phone screen
          const px = (e.mods.shift ? e.dx || e.dy : e.dx) * unit;
          const py = (e.mods.shift ? 0 : e.dy) * unit;
          return [{ type: "pan", dx: -px, dy: -py }];
        }
        // zoom, with a speed limit: a single gesture can never fling the view to the limits
        const dt = Math.min(0.12, Math.max(0.008, (e.t - lastWheel) / 1000));
        lastWheel = e.t;
        const wanted = e.dy * unit * (e.mods.ctrl ? I.pinchZoomPerWheel : settings.view.zoomPerWheel);
        const limit = Math.log(I.maxZoomFactorPerSecond) * dt;
        return [{ type: "zoom", factor: Math.exp(Math.min(limit, Math.max(-limit, wanted))), x: e.x, y: e.y }];
      }
      case "gesture": {
        if (e.phase === "start") { gestureScale = 1; return []; }
        if (e.phase === "end") return [];
        const k = gestureScale / (e.scale || 1);
        gestureScale = e.scale || 1;
        return [{ type: "zoom", factor: k, x: e.x, y: e.y }];
      }
      case "leave": return [{ type: "hoverEnd" }];
      case "tick": {
        if (g?.mode === "one" && !g.moved && !g.long && e.t - g.t0 >= I.longPressMs) {
          g.long = true;
          return [{ type: "menu", x: g.x, y: g.y }];
        }
        return [];
      }
      default:
        return e.device === "touch" ? touch(e) : pointer(e);
    }
  }

  function pointer(e: Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>): Intent[] {
    if (e.kind === "down") {
      g = { mode: "mouse", button: e.button, x0: e.x, y0: e.y, x: e.x, y: e.y, moved: false, action: actionOf(e.button, e.mods), shift: e.mods.shift };
      return [];
    }
    if (e.kind === "move") {
      if (!g || g.mode !== "mouse") return [{ type: "hover", x: e.x, y: e.y }];
      if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < settings.view.clickMovePx) return [];
      g.moved = true;
      const [dx, dy] = [e.x - g.x, e.y - g.y];
      g.x = e.x;
      g.y = e.y;
      return [{ type: g.action === "pan" ? "pan" : "orbit", dx, dy }];
    }
    const cur = g;
    g = null;
    if (e.kind === "cancel" || !cur || cur.mode !== "mouse" || cur.moved) return [];
    if (cur.action === "menu") return [{ type: "menu", x: e.x, y: e.y }];
    if (cur.action === "click") return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, false), shift: cur.shift }];
    return [];
  }

  function touch(e: Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>): Intent[] {
    if (e.kind === "down") {
      touches.set(e.id, { id: e.id, x: e.x, y: e.y });
      if (touches.size === 1) g = { mode: "one", id: e.id, x0: e.x, y0: e.y, x: e.x, y: e.y, t0: e.t, moved: false, long: false };
      else if (touches.size === 2 && g && (g.mode === "one" || g.mode === "done")) g = { mode: "two", ...two() };
      return [];
    }
    const t = touches.get(e.id);
    if (e.kind === "move") {
      if (!t || !g) return [];
      t.x = e.x;
      t.y = e.y;
      if (g.mode === "one") {
        if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < I.touchSlopPx) return [];
        g.moved = true;
        const [dx, dy] = [e.x - g.x, e.y - g.y];
        g.x = e.x;
        g.y = e.y;
        return g.long ? [] : [{ type: "orbit", dx, dy }];
      }
      if (g.mode === "two" && touches.size === 2) {
        const n = two();
        const out: Intent[] = [{ type: "pan", dx: n.cx - g.cx, dy: n.cy - g.cy }];
        if (g.d > 1 && n.d > 1 && Math.abs(n.d - g.d) > 0.5) out.push({ type: "zoom", factor: g.d / n.d, x: n.cx, y: n.cy });
        g = { mode: "two", ...n };
        return out;
      }
      return [];
    }
    touches.delete(e.id);
    const cur = g;
    if (touches.size === 0) g = null;
    else if (cur?.mode === "two") g = { mode: "done" };
    if (e.kind === "cancel" || !cur || cur.mode !== "one" || cur.moved || cur.long || cur.id !== e.id) return [];
    return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, true), shift: false }];
  }

  return { feed, setScrollMode: (m: S["scrollMode"]) => { scrollMode = m; }, get scrollMode() { return scrollMode; } };
}
