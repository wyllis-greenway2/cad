// A finger: one-finger drag orbits, two fingers pan and pinch to zoom, tap, double tap and triple tap are the clicks (while a figure is drawn a tap is `tapAim`: it sets the point held under the cursor and holds the cursor at the tap for the next, `in_286`), a long press is the menu.
import type { Intent, RawInput } from "../../shared/input.ts";
import type { settings } from "../../shared/settings.ts";
import type { ClickCounter } from "./clicks.ts";

type Pointer = Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>;
interface Pt { id: number; x: number; y: number }
type Gesture =
  | { mode: "one"; id: number; x0: number; y0: number; x: number; y: number; t0: number; moved: boolean; long: boolean }
  | { mode: "handle"; id: number; x0: number; y0: number; cx0: number; cy0: number; moved: boolean; lx: number; ly: number } // the drag icon of the touch helper
  | { mode: "two"; cx: number; cy: number; d: number }
  | { mode: "done" }; // two fingers were down: nothing more until all are lifted

const HANDLE_PX = 34; // how near the finger must be to the drag icon of the touch helper
const TAP_HANDLE_PX = 28; // how near a tap must be to an arrow or ring of an operation to select it (any other tap while the helper is up is a right click: it applies, or puts the tool away)

/** What a finger is offered (`in_283`, `in_284`), told by the screen each frame, in the view's own numbers. `cursor`: a figure is being drawn: the icon drags a cursor that stands in for hover. `handle`: an arrow or ring of an operation has been tapped: the icon drags it as a mouse would (`anchor` is a point on it). */
export interface TouchHelper { kind: "cursor" | "handle"; /** the cursor, or a point on the handle: where the drag acts */ anchor: [number, number]; /** the drag icon */ icon: [number, number]; /** every handle of the operation, as screen polylines: a tap near one selects it */ handles: [number, number][][]; /** something is open that a right click closes (a figure being drawn, an operation): a tap anywhere else is that right click; false: a tap anywhere else is an ordinary click */ closes: boolean }
const nearLine = (p: readonly [number, number][], x: number, y: number): boolean => {
  for (let i = 0; i < Math.max(1, p.length - 1); i++) {
    const [a, b] = [p[i]!, p[Math.min(i + 1, p.length - 1)]!];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    if (Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)) <= TAP_HANDLE_PX) return true;
  }
  return false;
};

export function createTouch(I: typeof settings.input, countClick: ClickCounter, slopPx: () => number = () => I.touchSlopPx, drawing: () => boolean = () => false) {
  let g: Gesture | null = null;
  /** While a figure is being drawn, or an arrow or ring of an operation has been tapped, a finger is offered a drag icon and a check (`TouchHelper`) */
  let helper: TouchHelper | null = null;
  const touches = new Map<number, Pt>();
  const two = () => {
    const [a, b] = [...touches.values()];
    return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, d: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };

  return {
    pointer(e: Pointer): Intent[] {
      if (e.kind === "down") {
        touches.set(e.id, { id: e.id, x: e.x, y: e.y });
        if (touches.size === 1 && helper && Math.hypot(e.x - helper.icon[0], e.y - helper.icon[1]) <= HANDLE_PX) g = { mode: "handle", id: e.id, x0: e.x, y0: e.y, cx0: helper.anchor[0], cy0: helper.anchor[1], moved: false, lx: e.x, ly: e.y };
        else if (touches.size === 1) g = { mode: "one", id: e.id, x0: e.x, y0: e.y, x: e.x, y: e.y, t0: e.t, moved: false, long: false };
        else if (touches.size === 2 && g && (g.mode === "one" || g.mode === "done" || g.mode === "handle")) g = { mode: "two", ...two() };
        return [];
      }
      const t = touches.get(e.id);
      if (e.kind === "move") {
        if (!t || !g) return [];
        t.x = e.x;
        t.y = e.y;
        if (g.mode === "handle") {
          if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < 3) return [];
          g.moved = true;
          const [x, y] = [g.cx0 + e.x - g.x0, g.cy0 + e.y - g.y0];
          if (helper?.kind === "handle") { const dx = e.x - g.lx, dy = e.y - g.ly; g.lx = e.x; g.ly = e.y; return [{ type: "orbit", dx, dy, x, y }]; } // the drag of an arrow or ring, as the mouse would make it: it began on the handle (the first move says where it began: (x - dx, y - dy))
          return [{ type: "hover", x, y }]; // the cursor follows the icon, like a mouse's hover: the line, the guides and the hints follow it
        }
        if (g.mode === "one") {
          if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < slopPx()) return [];
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
      if (cur?.mode === "handle" && cur.id === e.id) return cur.moved && helper?.kind === "handle" && e.kind !== "cancel" ? [{ type: "dragEnd" }] : []; // the icon only drags (the check beside it applies)
      if (cur?.mode === "one" && cur.moved && !cur.long && cur.id === e.id) return [{ type: "dragEnd" }];
      if (e.kind === "cancel" || !cur || cur.mode !== "one" || cur.moved || cur.long || cur.id !== e.id) return [];
      // a tap while the helper is up: on an arrow or ring of the operation it selects that (a click); anywhere else it is a right click: an operation is applied, a tool put away (`in_284`, corrected by `in_285`: apply, not cancel)
      if (helper?.closes && !helper.handles.some((p) => nearLine(p, e.x, e.y))) return [{ type: "menu", x: e.x, y: e.y }];
      // a sketch tool is on and a finger has no hover: a tap sets the point the cursor is held at and holds it for the next where the tap was (`in_286`)
      if (drawing()) return [{ type: "tapAim", x: e.x, y: e.y }];
      return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, true), shift: false }];
    },
    setHelper(h: TouchHelper | null) { helper = h; },
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
