// A mouse or a pen: click, right click = menu, right-drag or Alt + left-drag orbit, middle-drag or Shift + right-drag or Space + drag pan, left-drag on empty space orbits.
// The left button held down on one spot for a while (`in_235`) makes the intent `hold`: the cursor changes and the drag that follows, without letting up, draws a selection rectangle.
import type { Intent, RawInput, Mods } from "../../shared/input.ts";
import { settings } from "../../shared/settings.ts";
import type { ClickCounter } from "./clicks.ts";

type Pointer = Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>;
type Action = "orbit" | "pan" | "click" | "menu";
interface Drag { button: number; x0: number; y0: number; x: number; y: number; t0: number; moved: boolean; held: boolean; action: Action; shift: boolean }

export function createMouse(countClick: ClickCounter, spaceHeld: () => boolean, slopPx: () => number = () => settings.view.clickMovePx, holdMs: () => number = () => settings.input.boxHoldMs) {
  let g: Drag | null = null;
  const actionOf = (button: number, m: Mods): Action => {
    if (button === 1) return "pan";
    if (button === 2) return m.shift ? "pan" : "menu"; // a right click without moving is the menu; dragging orbits (decided on move)
    if (spaceHeld() || (m.alt && m.shift)) return "pan";
    if (m.alt) return "orbit";
    return "click"; // a plain left press: a click if it does not move, else orbit; held, a selection rectangle
  };
  const feed = (e: Pointer): Intent[] => {
    if (e.kind === "down") {
      const lost = g?.moved && g.action !== "pan" ? [{ type: "dragEnd" } as Intent] : []; // a press while one is still down: the release of the first never came
      g = { button: e.button, x0: e.x, y0: e.y, x: e.x, y: e.y, t0: e.t, moved: false, held: false, action: actionOf(e.button, e.mods), shift: e.mods.shift };
      return lost;
    }
    if (e.kind === "move") {
      if (!g) return [{ type: "hover", x: e.x, y: e.y }];
      if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < slopPx()) return [];
      g.moved = true;
      const [dx, dy] = [e.x - g.x, e.y - g.y];
      g.x = e.x;
      g.y = e.y;
      return [g.action === "pan" ? { type: "pan", dx, dy } : { type: "orbit", dx, dy, x: e.x, y: e.y, ...(g.button === 2 ? { view: true } : {}) }];
    }
    const cur = g;
    g = null;
    if (cur?.moved && cur.action !== "pan") return [{ type: "dragEnd" }]; // the drag (of the camera, of a handle or of a rectangle) is over
    if (e.kind === "cancel" || !cur || cur.moved) return [];
    if (cur.action === "menu") return [{ type: "menu", x: e.x, y: e.y }];
    if (cur.action === "click") return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, false), shift: cur.shift }];
    return [];
  };
  /** Time passes while a button is down: held still long enough, it is a hold. */
  feed.tick = (t: number): Intent[] => {
    if (!g || g.action !== "click" || g.moved || g.held || t - g.t0 < holdMs()) return [];
    g.held = true;
    return [{ type: "hold", x: g.x0, y: g.y0, shift: g.shift }];
  };
  return feed;
}
