// A mouse or a pen: click, right click = menu, right-drag or Alt + left-drag orbit, middle-drag or Shift + right-drag or Space + drag pan, left-drag on empty space orbits.
import type { Intent, RawInput, Mods } from "../../shared/input.ts";
import { settings } from "../../shared/settings.ts";
import type { ClickCounter } from "./clicks.ts";

type Pointer = Extract<RawInput, { kind: "down" | "move" | "up" | "cancel" }>;
type Action = "orbit" | "pan" | "click" | "menu";
interface Drag { button: number; x0: number; y0: number; x: number; y: number; moved: boolean; action: Action; shift: boolean }

export function createMouse(countClick: ClickCounter, spaceHeld: () => boolean, slopPx: () => number = () => settings.view.clickMovePx) {
  let g: Drag | null = null;
  const actionOf = (button: number, m: Mods): Action => {
    if (button === 1) return "pan";
    if (button === 2) return m.shift ? "pan" : "menu"; // a right click without moving is the menu; dragging orbits (decided on move)
    if (spaceHeld() || (m.alt && m.shift)) return "pan";
    if (m.alt) return "orbit";
    return "click"; // a plain left press: a click if it does not move, else orbit
  };
  return (e: Pointer): Intent[] => {
    if (e.kind === "down") {
      const lost = g?.moved && g.action !== "pan" ? [{ type: "dragEnd" } as Intent] : []; // a press while one is still down: the release of the first never came
      g = { button: e.button, x0: e.x, y0: e.y, x: e.x, y: e.y, moved: false, action: actionOf(e.button, e.mods), shift: e.mods.shift };
      return lost;
    }
    if (e.kind === "move") {
      if (!g) return [{ type: "hover", x: e.x, y: e.y }];
      if (!g.moved && Math.hypot(e.x - g.x0, e.y - g.y0) < slopPx()) return [];
      g.moved = true;
      const [dx, dy] = [e.x - g.x, e.y - g.y];
      g.x = e.x;
      g.y = e.y;
      return [g.action === "pan" ? { type: "pan", dx, dy } : { type: "orbit", dx, dy, x: e.x, y: e.y }];
    }
    const cur = g;
    g = null;
    if (cur?.moved && cur.action !== "pan") return [{ type: "dragEnd" }]; // the drag (of the camera or of a handle) is over
    if (e.kind === "cancel" || !cur || cur.moved) return [];
    if (cur.action === "menu") return [{ type: "menu", x: e.x, y: e.y }];
    if (cur.action === "click") return [{ type: "click", x: e.x, y: e.y, count: countClick(e.x, e.y, e.t, false), shift: cur.shift }];
    return [];
  };
}
