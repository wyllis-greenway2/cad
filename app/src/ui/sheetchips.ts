// The icons on the sheets that are invisible (`in_459`, `in_1160`): an invisible sheet cannot be pointed at or selected, so its icons cannot be in the helpful bar (`suggest.ts`, where the icons of a sheet that is selected are); they fade in while the pointer is over the sheet.
// They only show and report the click.
import { iconSvg } from "./icons.ts";
import { roundButton, onPress } from "./look.ts";
import type { Vec3 } from "../interaction/api.ts";

export interface SheetView { ref: string; mode: 0 | 1 | 2; hidden: boolean; move: 0 | 1; selected: boolean; corners: Vec3[] }

const MODE_ICON = ["sheetCutUp", "sheetCutDown", "sheetPlain"] as const;
const MODE_TITLE = [
  "Cuts away the half the plane faces (tap for the next mode)",
  "Cuts away the other half (tap for the next mode)",
  "Does not cut (tap for the next mode)",
] as const;
const MOVE_TITLE = [
  "Its arrows move it along x, y and z; tap to turn it with the rings instead",
  "Its rings turn it about x, y and z; tap to move it with the arrows instead",
] as const;

export function createSheetChips(host: HTMLElement, run: (id: string) => void) {
  type Pair = { box: HTMLDivElement; mode: HTMLDivElement; eye: HTMLDivElement; move: HTMLDivElement; del: HTMLDivElement; sig: string };
  const pool = new Map<string, Pair>();
  const button = (parent: HTMLElement, id: () => string): HTMLDivElement => {
    const b = roundButton({ size: 30, edge: "#8a8f98" }); // (a darker edge: it stands on the model)
    b.style.font = "700 13px system-ui,sans-serif"; // (the letter of a plane across an axis)
    onPress(b, () => run(id()));
    parent.appendChild(b);
    return b;
  };
  const make = (ref: string): Pair => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:0;top:0;display:none;gap:6px;z-index:6;align-items:center;transition:opacity .2s";
    host.appendChild(box);
    const mode = button(box, () => `sheet:mode:${ref}`);
    const eye = button(box, () => `sheet:visible:${ref}`);
    const move = button(box, () => "sheet:move");
    const del = button(box, () => `sheet:delete:${ref}`);
    del.innerHTML = iconSvg("trash");
    del.title = "Delete this plane";
    return { box, mode, eye, move, del, sig: "" };
  };
  const inside = (pt: [number, number], poly: [number, number][]): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [a, b] = [poly[i]!, poly[j]!];
      if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  return {
    /** The rects the icons fill (the bubbles keep off them). */
    rects(): DOMRect[] { return [...pool.values()].filter((p) => p.box.style.display !== "none").map((p) => p.box.getBoundingClientRect()); },
    /** `sheets` with each corner's page position (`screen`), the pointer's page position (or null): the icons are put at the first corner, in toward the middle. */
    update(sheets: SheetView[], screen: (q: Vec3) => [number, number] | null, pointer: [number, number] | null): void {
      const seen = new Set<string>();
      for (const sh of sheets) {
        const pts = sh.corners.map(screen);
        if (pts.some((q) => !q)) continue;
        const poly = pts as [number, number][];
        seen.add(sh.ref);
        const pair = pool.get(sh.ref) ?? make(sh.ref);
        pool.set(sh.ref, pair);
        const sig = `${sh.mode}${sh.hidden}${sh.move}${sh.selected}`;
        if (sig !== pair.sig) {
          pair.sig = sig;
          pair.mode.innerHTML = iconSvg(MODE_ICON[sh.mode]);
          pair.mode.title = MODE_TITLE[sh.mode];
          pair.eye.innerHTML = iconSvg(sh.hidden ? "eyeOff" : "eye");
          pair.eye.title = sh.hidden ? "Invisible: it cannot be pointed at; tap to make it visible" : "Visible; tap to make it invisible";
          pair.move.innerHTML = iconSvg(sh.move === 0 ? "move" : "rotate"); // (the tool the handles are: move or turn, as a body's, `in_1129`)
          pair.move.title = MOVE_TITLE[sh.move];
          pair.move.style.display = sh.selected ? "flex" : "none";
        }
        // in from the first corner towards the opposite one, so the icons sit on the sheet
        const [a, c] = [poly[0]!, poly[2]!];
        const at: [number, number] = [a[0] + (c[0] - a[0]) * 0.1 - 6, a[1] + (c[1] - a[1]) * 0.1 - 6];
        pair.box.style.transform = `translate(${Math.round(at[0])}px, ${Math.round(at[1])}px)`;
        pair.box.style.display = "flex";
        // an invisible sheet's icon is there only while the pointer is over the sheet (or the icon itself)
        const over = !!pointer && (inside(pointer, poly) || pair.box.matches(":hover"));
        pair.box.style.opacity = sh.hidden && !over && !sh.selected ? "0" : "1";
        pair.box.style.pointerEvents = sh.hidden && !over && !sh.selected ? "none" : "auto";
      }
      for (const [ref, pair] of pool) if (!seen.has(ref)) { pair.box.remove(); pool.delete(ref); }
    },
  };
}
