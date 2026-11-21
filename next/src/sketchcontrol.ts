// The sketching controller: the tool that is on, the figures drawn on each plane, and what to show of them. It knows nothing of which planes there are: the host says where each is.
import { viewHeight, forwardDepth, type Cam } from "./camera.ts";
import { cancelFigure, newTool, onPlane, outline, place, preview, snap, to2, to3, type P2, type Shape, type Tool, type ToolKind } from "./sketch.ts";
import type { Frame } from "./planes.ts";
import { settings } from "./settings.ts";
import { vOf } from "./planes.ts";
import { add, scale, type V3 } from "./vec.ts";

export interface SketchHost {
  view(): { cam: Cam; w: number; h: number };
  /** Every plane there is, by name (the figures of a plane that is gone are let go), and the one that is on. */
  planes(): { all: Map<string, Frame>; on: string; step: number };
  ray(x: number, y: number): { o: V3; d: V3 };
}
export interface DrawLine { pts: V3[]; kind: "done" | "preview" | "cursor" }

export function createSketch(host: SketchHost) {
  const shapes = new Map<string, Shape[]>();
  let tool: Tool | null = null;
  const here = (x: number, y: number): { key: string; f: Frame; p: P2 } | null => {
    const { all, on, step } = host.planes(), f = all.get(on), { cam, h } = host.view();
    if (!f) return null;
    const r = host.ray(x, y), q = onPlane(f, r.o, r.d);
    if (!q) return null;
    const mm = (viewHeight(cam, Math.max(forwardDepth(cam, q), 1e-3)) / h) * settings.sketch.snapPx; // (the snap distance in mm: so many pixels wherever the view is)
    return { key: on, f, p: snap(to2(f, q), shapes.get(on) ?? [], step, mm) };
  };
  return {
    active: () => tool !== null,
    start(kind: ToolKind) { tool = newTool(kind); },
    /** Right click or Esc: the figure under way is given up; with none, the tool is put away. Returns whether there was a tool. */
    stop(): boolean {
      if (!tool) return false;
      if (tool.pts.length) tool = cancelFigure(tool); else tool = null;
      return true;
    },
    /** A click: a point of the figure. A double click ends a line's chain. Returns whether the click was the tool's. */
    click(x: number, y: number, count: number): boolean {
      if (!tool) return false;
      if (count >= 2) { tool = cancelFigure(tool); return true; }
      const at = here(x, y);
      if (!at) return true;
      const r = place(tool, at.p);
      tool = r.tool;
      if (r.made.length) shapes.set(at.key, [...(shapes.get(at.key) ?? []), ...r.made]);
      return true;
    },
    /** What to draw: every figure on every plane, what the tool would make, and the place the pointer is at. */
    lines(pointer: { x: number; y: number } | null): DrawLine[] {
      const { all } = host.planes(), out: DrawLine[] = [];
      for (const k of [...shapes.keys()]) if (!all.has(k)) shapes.delete(k); // (the plane is gone, and its figures)
      for (const [k, list] of shapes) { const f = all.get(k)!; for (const s of list) out.push({ kind: "done", pts: outline(s).map((p) => to3(f, p)) }); }
      const at = tool && pointer ? here(pointer.x, pointer.y) : null;
      if (tool && at) {
        const pv = preview(tool, at.p);
        if (pv) out.push({ kind: "preview", pts: outline(pv).map((p) => to3(at.f, p)) });
        else if (tool.pts[0]) out.push({ kind: "preview", pts: [to3(at.f, tool.pts[0]), to3(at.f, at.p)] });
        const { cam, h } = host.view(), c = to3(at.f, at.p), arm = (viewHeight(cam, Math.max(forwardDepth(cam, c), 1e-3)) / h) * settings.sketch.crossPx;
        out.push({ kind: "cursor", pts: [add(c, scale(at.f.u, -arm)), add(c, scale(at.f.u, arm))] }, { kind: "cursor", pts: [add(c, scale(vOf(at.f), -arm)), add(c, scale(vOf(at.f), arm))] });
      }
      return out;
    },
    debug: () => ({ tool: tool ? { ...tool } : null, shapes: [...shapes].map(([k, v]) => [k, v] as const) }),
  };
}
