// The drawing tools as rules (`in_1576`): what a click does to the tool under way and to the drawing, and what the tool would make where the pointer is. Pure: the tool, the definition, a place in the plane in; the tool, the edit (or nothing) and the lines to show out.
// The controller (`sketchcontrol.ts`) only turns a pointer into a place and a result into the screen's words and lines. A line is two clicks (one that ends on a point already drawn goes on from it); a rectangle two corners; a circle the middle and a point on it;
// an arc the centre, the start and where it ends; Trim is the engine's (`engine/trim.ts`), the controller's.
import type { SketchParams } from "../engine/sketch.ts";
import { addArc, addCircle, addLine, addRect, arcWay, posOf, type Ref, type Sol } from "./drawing.ts";
import type { StrokeKind } from "./style.ts";
import type { Pt } from "../engine/region.ts";
import { emptyTyped } from "./typing.ts";

export type DrawKind = "line" | "rect" | "circle" | "arc";
/** a tool and the places put down so far for the figure under way */
export interface Tool {
  kind: DrawKind | "trim";
  pts: Ref[];
  /** the numbers typed for the figure under way, one for each of the tool's numbers ("": not typed), and which one digits go to (`typing.ts`) */ typed: string[];
  field: number;
}
export const newTool = (kind: Tool["kind"]): Tool => ({ kind, pts: [], typed: emptyTyped(kind), field: 0 });
/** the figure given up (a line's chain ends) */
export const cancelFigure = (t: Tool): Tool => ({ ...t, pts: [], typed: emptyTyped(t.kind), field: 0 });
export interface Clicked {
  tool: Tool;
  /** the drawing with the figure in it (null: the click made nothing yet, or nothing at all), and its name for the history */ made?: {
    params: SketchParams | null;
    label: string;
  };
}

/** a click at a place (as a point of the sketch or a free place) */
export function toolClick(t: Tool, p: SketchParams, s: Sol, r: Ref): Clicked {
  const a = t.pts[0];
  if (!a) return { tool: { ...t, pts: [r] } };
  switch (t.kind) {
    case "arc":
      if (t.pts.length === 1) return { tool: { ...t, pts: [a, r] } };
      return { tool: cancelFigure(t), made: { params: addArc(p, s, t.pts[0]!, t.pts[1]!, posOf(s, r)), label: "Arc" } };
    case "line":
      return {
        tool: { ...cancelFigure(t), pts: "id" in r ? [r] : [] },
        made: { params: addLine(p, s, a, r), label: "Line" },
      }; // (a line is two clicks; one that ends on a point already drawn goes on from it, as the old app's does)
    case "rect":
      return { tool: cancelFigure(t), made: { params: addRect(p, s, a, r), label: "Rectangle" } };
    case "circle":
      return { tool: cancelFigure(t), made: { params: addCircle(p, s, a, posOf(s, r)), label: "Circle" } };
    default:
      return { tool: t };
  }
}

export interface Shown {
  kind: StrokeKind;
  pts: Pt[];
}
/** What the tool would make if the next click were at `at` (a place, as a point of the sketch or free): the lines to show, in the plane's axes */
export function toolPreview(t: Tool, s: Sol, at: Pt): Shown[] {
  const a = t.pts[0],
    A = a ? posOf(s, a) : null,
    out: Shown[] = [];
  if (A && t.kind === "line") out.push({ kind: "preview", pts: [A, at] });
  else if (A && t.kind === "rect") out.push({ kind: "preview", pts: [A, [at[0], A[1]], at, [A[0], at[1]], A] });
  else if (A && t.kind === "arc" && t.pts.length === 1)
    out.push({ kind: "preview", pts: [A, at] }); // (the radius, to the pointer)
  else if (t.kind === "arc" && t.pts.length === 2) {
    // the arc from its start to where the pointer is, and the lines from its centre
    const m = posOf(s, t.pts[0]!),
      st = posOf(s, t.pts[1]!),
      r = Math.hypot(st[0] - m[0], st[1] - m[1]),
      d = Math.hypot(at[0] - m[0], at[1] - m[1]);
    if (r > 1e-9 && d > 1e-9) {
      const e: Pt = [m[0] + ((at[0] - m[0]) / d) * r, m[1] + ((at[1] - m[1]) / d) * r],
        w = arcWay(m, st, e),
        a0 = Math.atan2(st[1] - m[1], st[0] - m[0]),
        n = Math.max(2, Math.ceil(w.sweep / 0.05)),
        sgn = w.cw ? -1 : 1;
      out.push(
        {
          kind: "preview",
          pts: Array.from(
            { length: n + 1 },
            (_, k) =>
              [
                m[0] + r * Math.cos(a0 + (sgn * w.sweep * k) / n),
                m[1] + r * Math.sin(a0 + (sgn * w.sweep * k) / n),
              ] as Pt,
          ),
        },
        { kind: "preview", pts: [st, m, e] },
      );
    }
  } else if (A && t.kind === "circle") {
    const rad = Math.hypot(at[0] - A[0], at[1] - A[1]);
    out.push({
      kind: "preview",
      pts: Array.from(
        { length: 65 },
        (_, k) => [A[0] + rad * Math.cos((k / 64) * 2 * Math.PI), A[1] + rad * Math.sin((k / 64) * 2 * Math.PI)] as Pt,
      ),
    });
  }
  return out;
}
