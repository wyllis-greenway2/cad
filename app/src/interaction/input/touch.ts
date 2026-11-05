// A finger: one-finger drag orbits, two fingers pan and pinch to zoom, tap, double tap and triple tap are the clicks, a long press is the menu.
import type { Intent, RawInput } from "../../shared/input.ts";
import type { settings } from "../../shared/settings.ts";
import type { ClickCounter } from "./clicks.ts";

type Pointer = Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>;
interface Pt { id: number; x: number; y: number }
type Gesture =
  | { mode: "one"; id: number; x0: number; y0: number; x: number; y: number; t0: number; moved: boolean; long: boolean }
  | { mode: "two"; cx: number; cy: number; d: number }
  | { mode: "done" }; // two fingers were down: nothing more until all are lifted

export function createTouch(I: typeof settings.input, countClick: ClickCounter) {
  let g: Gesture | null = null;
  const touches = new Map<number, Pt>();
  const two = () => {
    const [a, b] = [...touches.values()];
    return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, d: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };

  return {
    pointer(e: Pointer): Intent[] {
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
          return g.long ? [] : [{ type: "orbit", dx, dy, x: e.x, y: e.y }];
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
      if (cur?.mode === "one" && cur.moved && !cur.long && cur.id === e.id) return [{ type: "dragEnd" }];
      if (e.kind === "cancel" || !cur || cur.mode !== "one" || cur.moved || cur.long || cur.id !== e.id) return [];
      return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, true), shift: false }];
    },
    /** Time passing while a finger is down: a press that has not moved for long enough is the menu. */
    tick(t: number): Intent[] {
      if (g?.mode === "one" && !g.moved && !g.long && t - g.t0 >= I.longPressMs) {
        g.long = true;
        return [{ type: "menu", x: g.x, y: g.y }];
      }
      return [];
    },
  };
}
