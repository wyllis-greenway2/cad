// The laser outline route (`in_569`, `dec_laser_outline_route`, `dec_manufacturing_prep` v1): a flat drawing, with its lines marked cut, score or engrave, becomes the path of a laser beam. It is a standard route: it declares
// its settings, says whether the part fits, checks it, and plans; the file is written by the shared Emit stage. Everything geometric is in `prepare.ts` and `core/`.
import { CONTRACT_VERSION } from "../../contract/index.ts";
import type { Route, FitReport, Finding, Toolpath, Move, ToolpathOperation, Point2, Point3, PartSnapshot, RouteContext, ParamSpec, Layer } from "../../contract/index.ts";
import { prepare } from "./prepare.ts";
import { sweepOf, loopsOf, polygonOf, boxOf } from "../../core/outline.ts";
import type { Prepared } from "./prepare.ts";

/** The settings. The numbers are only a place to start: power and speed depend on the laser, the lens and the material, so test on a scrap (`help` says so). */
const PARAMS: ParamSpec[] = [
  { id: "kerf", label: "Kerf", kind: "number", unit: "mm", min: 0, max: 2, default: 0.15, group: "Cut", help: "How wide the beam cuts. The path is moved out by half of it round a part and in by half in a hole, so the part comes out the size it was drawn. 0: cut on the drawn line." },
  { id: "cutPower", label: "Cut power", kind: "number", unit: "%", min: 1, max: 100, default: 100, group: "Cut", help: "A place to start: it depends on your laser and the material. Test on a scrap." },
  { id: "cutSpeed", label: "Cut speed", kind: "number", unit: "mm/min", min: 1, max: 30000, default: 600, group: "Cut", help: "A place to start: test on a scrap." },
  { id: "cutPasses", label: "Cut passes", kind: "number", min: 1, max: 20, default: 1, group: "Cut", help: "Times round each cut line." },
  { id: "tabs", label: "Tabs", kind: "number", min: 0, max: 24, default: 0, group: "Cut", help: "Small bridges left on each outside edge so a cut part stays in place. 0: none." },
  { id: "tabWidth", label: "Tab width", kind: "number", unit: "mm", min: 0.1, max: 20, default: 1.5, group: "Cut" },
  { id: "scorePower", label: "Score power", kind: "number", unit: "%", min: 1, max: 100, default: 20, group: "Score" },
  { id: "scoreSpeed", label: "Score speed", kind: "number", unit: "mm/min", min: 1, max: 30000, default: 1500, group: "Score" },
  { id: "engravePower", label: "Engrave power", kind: "number", unit: "%", min: 1, max: 100, default: 10, group: "Engrave" },
  { id: "engraveSpeed", label: "Engrave speed", kind: "number", unit: "mm/min", min: 1, max: 30000, default: 3000, group: "Engrave" },
  { id: "toCorner", label: "Part to the corner", kind: "boolean", default: true, group: "Place", help: "Move the part so its lower left corner is at the machine's zero." },
];

/** The drawing's size in its own plane (the part's `bbox` is in the world, which is not the plane's own x and y unless the plane is the XY one). */
const sizeOf = (p: PartSnapshot): { w: number; h: number } => { const b = boxOf(loopsOf((p.outlines ?? []).flatMap((o) => o.pieces)).map((l) => polygonOf(l))); return b ? { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] } : { w: 0, h: 0 }; };

function fit(part: PartSnapshot, ctx?: RouteContext): FitReport {
  const reasons: string[] = [];
  if (part.kind !== "flat" || !part.outlines?.some((o) => o.pieces.length)) reasons.push("it needs a flat drawing with lines in it");
  if (ctx) {
    const { w, h } = sizeOf(part);
    const [ew, eh] = [ctx.machine.envelope.max[0] - ctx.machine.envelope.min[0], ctx.machine.envelope.max[1] - ctx.machine.envelope.min[1]];
    if (w > ew + 1e-6 || h > eh + 1e-6) reasons.push(`the drawing is ${w.toFixed(1)} × ${h.toFixed(1)} mm and the machine's area is ${ew} × ${eh} mm`);
  }
  return { fits: !reasons.length, reasons };
}

const world = (part: PartSnapshot, at: Point2): Point3 => {
  const pl = part.outlines?.[0]?.plane;
  if (!pl) return [at[0], at[1], 0];
  const y: Point3 = [pl.normal[1] * pl.xDir[2] - pl.normal[2] * pl.xDir[1], pl.normal[2] * pl.xDir[0] - pl.normal[0] * pl.xDir[2], pl.normal[0] * pl.xDir[1] - pl.normal[1] * pl.xDir[0]];
  return [pl.origin[0] + at[0] * pl.xDir[0] + at[1] * y[0], pl.origin[1] + at[0] * pl.xDir[1] + at[1] * y[1], pl.origin[2] + at[0] * pl.xDir[2] + at[1] * y[2]];
};

function check(part: PartSnapshot, ctx: RouteContext): Finding[] {
  const out = prepare(part, ctx.settings).problems.map((p, i): Finding => ({
    id: `laser-outline:${p.kind}:${i}`,
    severity: p.kind === "kerf" || p.kind === "thin" || p.kind === "open" ? "warning" : p.kind === "noCut" || p.kind === "noOutside" ? "info" : "caution",
    message: p.message,
    refs: p.at ? [{ kind: "point", at: world(part, p.at) }] : [],
  }));
  return out;
}

const percent = (ctx: RouteContext, id: string, d: number): number => (typeof ctx.settings[id] === "number" ? (ctx.settings[id] as number) : d) / 100;
const value = (ctx: RouteContext, id: string, d: number): number => (typeof ctx.settings[id] === "number" ? (ctx.settings[id] as number) : d);

function plan(part: PartSnapshot, ctx: RouteContext): Toolpath {
  const { paths, shift } = prepare(part, ctx.settings);
  const rapid = ctx.machine.limits.feed;
  const ops: ToolpathOperation[] = [];
  let seconds = 0;
  let at: [number, number] = [0, 0];
  const z = (p: Point2): Point3 => [p[0], p[1], 0];
  const layers: { layer: Layer; label: string; power: number; feed: number; passes: number }[] = [
    { layer: "cut", label: "Cut", power: percent(ctx, "cutPower", 100), feed: value(ctx, "cutSpeed", 600), passes: Math.max(1, Math.round(value(ctx, "cutPasses", 1))) },
    { layer: "score", label: "Score", power: percent(ctx, "scorePower", 20), feed: value(ctx, "scoreSpeed", 1500), passes: 1 },
    { layer: "engrave", label: "Engrave", power: percent(ctx, "engravePower", 10), feed: value(ctx, "engraveSpeed", 3000), passes: 1 },
  ];
  for (const { layer, label, power, feed, passes } of layers) {
    const list: Prepared[] = paths[layer];
    if (!list.length) continue;
    const moves: Move[] = [];
    for (let pass = 0; pass < passes; pass++) {
      for (const p of list) {
        const start = p.points[0]!;
        moves.push({ op: "travel", to: z(start) });
        seconds += (Math.hypot(start[0] - at[0], start[1] - at[1]) / rapid) * 60;
        at = [start[0], start[1]];
        const cut = (to: [number, number], len: number): void => { moves.push({ op: "cut", to: z(to), feed, power }); seconds += (len / feed) * 60; at = to; };
        if (p.items) {
          for (const it of p.items) {
            if (it.kind === "line") cut([it.q[0], it.q[1]], Math.hypot(it.q[0] - it.p[0], it.q[1] - it.p[1]));
            else {
              const sweep = Math.abs(sweepOf(it));
              moves.push({ op: "arc", to: z([it.q[0], it.q[1]]), center: z([it.center[0], it.center[1]]), clockwise: !it.ccw, feed, power });
              seconds += ((sweep * it.radius) / feed) * 60; at = [it.q[0], it.q[1]];
            }
          }
        } else {
          for (let i = 1; i < p.points.length; i++) cut([p.points[i]![0], p.points[i]![1]], Math.hypot(p.points[i]![0] - p.points[i - 1]![0], p.points[i]![1] - p.points[i - 1]![1]));
          if (p.closed) cut([start[0], start[1]], Math.hypot(start[0] - p.points[p.points.length - 1]![0], start[1] - p.points[p.points.length - 1]![1]));
        }
      }
    }
    ops.push({ id: layer, label, layer, moves });
  }
  const pl = part.outlines?.[0]?.plane;
  // the toolpath is in the machine's x and y (the part moved to the corner): its zero is where the drawing's own point (-shift) is, so a preview can lay it over the drawing
  return { units: "mm", operations: ops, seconds: Math.round(seconds), ...(pl ? { frame: { origin: world(part, [-shift[0], -shift[1]]), xDir: pl.xDir, normal: pl.normal } } : {}) };
}

export const laserOutline: Route = {
  contract: CONTRACT_VERSION, id: "laser-outline", name: "Laser outline", process: "laser", family: "toolpath", accepts: ["flat"], uses: ["machine", "material", "dialect"], params: PARAMS, fit, check, plan,
};
