// A sketch of the engine's own kind (points, lines, a circle, constraints: the solver's system) on the plane that is on, to try the bubbles by hand (`?bubbles=1`): click a part to select it (Shift adds), and the constraints of what is
// selected show as bubbles on it; type a new number in a dimension and the sketch is solved again, or the bubbles that hold it back flash red and the number goes back; the cross of an open constraint deletes it.
// It is the seed of the sketch controller that will replace the figure-only one (`sketchcontrol.ts`); the drawing tools do not make parts of this kind yet.
import { project, type Cam } from "./camera.ts";
import { to3, type P2 } from "./sketch.ts";
import type { DrawLine } from "./sketchcontrol.ts";
import type { Frame } from "./planes.ts";
import { solve, type System } from "./engine/solver.ts";
import { bubblesOn, placed, retype, type Flash } from "./interaction/bubbles.ts";
import { createBubbleLayer, type Placed } from "./bubbledraw.ts";
import { settings } from "./settings.ts";
import type { V3 } from "./vec.ts";

export interface DemoHost { view(): { cam: Cam; w: number; h: number }; plane(): Frame; ray(x: number, y: number): { o: V3; d: V3 } }

const start = (): System => ({
  points: [{ id: "P0", x: 0, y: 0 }, { id: "P1", x: 38, y: 2 }, { id: "P2", x: 41, y: 27 }, { id: "P3", x: -2, y: 24 }, { id: "C", x: 18, y: 11 }],
  lines: [{ id: "L0", a: "P0", b: "P1" }, { id: "L1", a: "P1", b: "P2" }, { id: "L2", a: "P2", b: "P3" }, { id: "L3", a: "P3", b: "P0" }],
  circles: [{ id: "K0", c: "C", r: 5 }],
  constraints: [
    { id: "c0", kind: "fixed", parts: ["P0"], at: [0, 0] }, { id: "c1", kind: "horizontal", parts: ["L0"] }, { id: "c2", kind: "horizontal", parts: ["L2"] },
    { id: "c3", kind: "vertical", parts: ["L1"] }, { id: "c4", kind: "vertical", parts: ["L3"] }, { id: "c5", kind: "length", parts: ["L0"], value: 40 }, { id: "c6", kind: "length", parts: ["L1"], value: 25 },
    { id: "c7", kind: "radius", parts: ["K0"], value: 6 }, { id: "c8", kind: "horizontalDistance", parts: ["P0", "C"], value: 20 }, { id: "c9", kind: "verticalDistance", parts: ["P0", "C"], value: 12 },
  ],
});

export function createSketchDemo(host: DemoHost, page: HTMLElement) {
  let S = (() => { const s = start(); return placed(s, solve(s).solution); })();
  let selection: string[] = [], flash: Flash = {}, flashUntil = 0, note = "";
  const layer = createBubbleLayer(page, {
    set(id, value) {
      const r = retype(S, id, value);
      if (r.ok) { S = r.solved; flash = {}; note = ""; } else { flash = { refused: r.victims.length ? r.victims : [id] }; flashUntil = performance.now() + 1800; note = r.reason; }
    },
    remove(id) { const next = { ...S, constraints: S.constraints.filter((c) => c.id !== id) }; S = placed(next, solve(next).solution); },
  });
  const px = (p: P2) => { const { cam, w, h } = host.view(), q = project(cam, to3(host.plane(), p), w, h); return [q.x, q.y] as [number, number]; };
  const pt = (id: string): P2 => { const p = S.points.find((q) => q.id === id)!; return [p.x, p.y]; };
  const ring = (c: { c: string; r: number }): P2[] => Array.from({ length: 65 }, (_, k) => [pt(c.c)[0] + c.r * Math.cos((k / 64) * 2 * Math.PI), pt(c.c)[1] + c.r * Math.sin((k / 64) * 2 * Math.PI)] as P2);
  const segDist = (p: [number, number], a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  /** the part under the pointer: a point first, then a line, then a circle's edge, within a few pixels */
  const pick = (x: number, y: number): string | null => {
    const at: [number, number] = [x, y], tol = settings.sketch.snapPx;
    for (const p of S.points) if (Math.hypot(...(px([p.x, p.y]).map((v, i) => v - at[i]!) as [number, number])) < tol) return p.id;
    for (const l of S.lines) if (segDist(at, px(pt(l.a)), px(pt(l.b))) < tol * 0.8) return l.id;
    for (const c of S.circles) { const r = ring(c).map(px); for (let i = 0; i + 1 < r.length; i++) if (segDist(at, r[i]!, r[i + 1]!) < tol * 0.8) return c.id; }
    return null;
  };
  return {
    /** A click: a part is selected (Shift adds or takes away); a click on nothing puts the selection away. Returns whether it was used. */
    click(x: number, y: number, shift: boolean): boolean {
      if (layer.editing()) return true;
      const id = pick(x, y);
      if (!id) { const had = selection.length > 0; selection = []; return had; }
      selection = shift ? (selection.includes(id) ? selection.filter((q) => q !== id) : [...selection, id]) : [id];
      return true;
    },
    clear() { const had = selection.length > 0; selection = []; return had; },
    lines(): DrawLine[] {
      const f = host.plane(), out: DrawLine[] = [];
      for (const l of S.lines) out.push({ kind: selection.includes(l.id) ? "preview" : "done", pts: [to3(f, pt(l.a)), to3(f, pt(l.b))] });
      for (const c of S.circles) out.push({ kind: selection.includes(c.id) ? "preview" : "done", pts: ring(c).map((p) => to3(f, p)) });
      return out;
    },
    /** Each picture: the bubbles of what is selected, on the page. */
    frame(now: number): void {
      if (now > flashUntil) { flash = {}; }
      const sel = selection, items: Placed[] = bubblesOn(S, sel, flash).map((bubble) => { const [x, y] = px(bubble.at); return { bubble, x, y }; });
      layer.show(items, { lines: S.lines.map((l) => [px(pt(l.a)), px(pt(l.b))] as [[number, number], [number, number]]), dots: S.points.map((p) => px([p.x, p.y])) });
    },
    note: () => note,
    /** where a part is on the page (a point, the middle of a line, the right of a circle's edge): for trying it by hand and for the dev check */
    at(id: string): [number, number] | null {
      const p = S.points.find((q) => q.id === id), l = S.lines.find((q) => q.id === id), c = S.circles.find((q) => q.id === id);
      if (p) return px([p.x, p.y]); if (l) { const a = pt(l.a), b = pt(l.b); return px([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); } if (c) return px([pt(c.c)[0] + c.r, pt(c.c)[1]]); return null;
    },
    bubbles: () => [...document.querySelectorAll<HTMLElement>("[data-bubble]")].map((e) => ({ id: e.dataset.bubble!, text: e.textContent, border: e.style.border })),
    debug: () => ({ S, selection }),
  };
}
