// Flat drawings as files (`dec_export_flat`): SVG (laser, vinyl, Inkscape) and DXF (CAD, CNC). The input is a list of 2D pieces in millimetres, x to the right and y up as drawn on the plane; the output is text.
// Pure data in, text out. SVG turns y over (its y goes down) so the picture is the same way up; DXF keeps y up.

export type V2 = [number, number];
/** a straight piece, an arc about a centre from `p` to `q` (counter-clockwise or not), or a whole circle */
export type Piece =
  | { k: "seg"; p: V2; q: V2; layer?: Layer }
  | { k: "arc"; c: V2; r: number; p: V2; q: V2; ccw: boolean; layer?: Layer }
  | { k: "circle"; c: V2; r: number; layer?: Layer };

/** What a line is for when the file goes to a laser, a cutter or a router (`in_563`, `dec_manufacturing_prep`): cut through, score (a shallow line, a fold), or engrave. The programs tell them apart by layer or colour. */
export type Layer = "cut" | "score" | "engrave";
/** The layers in the order they are written, with the colour a laser program sorts them by (red cuts, blue scores, black engraves: the usual convention) and the DXF colour number that goes with it. */
const LAYERS: { name: Layer; svg: string; aci: number }[] = [
  { name: "cut", svg: "#ff0000", aci: 1 },
  { name: "score", svg: "#0000ff", aci: 5 },
  { name: "engrave", svg: "#000000", aci: 7 },
];
/** Do any of the pieces say what they are for? (If none does the file has no layers, as before.) */
export const hasLayers = (pieces: readonly Piece[]): boolean => pieces.some((p) => p.layer !== undefined);

const TAU = Math.PI * 2;
const num = (v: number): string => String(Math.round(v * 1e5) / 1e5 + 0); // (a hundred-thousandth of a mm; no "-0")
const same = (a: V2, b: V2, tol: number): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/** How far round an arc goes, in radians: positive counter-clockwise, negative clockwise; a full turn when the ends are the same point. */
export function sweepOf(a: Extract<Piece, { k: "arc" }>): number {
  const [a0, a1] = [Math.atan2(a.p[1] - a.c[1], a.p[0] - a.c[0]), Math.atan2(a.q[1] - a.c[1], a.q[0] - a.c[0])];
  const ccw = ((a1 - a0) % TAU + TAU) % TAU;
  const s = a.ccw ? ccw : -(((a0 - a1) % TAU + TAU) % TAU);
  return Math.abs(s) < 1e-9 ? (a.ccw ? TAU : -TAU) : s;
}
/** An arc that comes back to where it began is a circle. */
const asCircle = (a: Extract<Piece, { k: "arc" }>, tol: number): Piece => (same(a.p, a.q, tol) ? { k: "circle", c: a.c, r: a.r, ...(a.layer ? { layer: a.layer } : {}) } : a);

/** The pieces joined end to end into runs (each piece turned the way the run goes), closed when a run comes back to its start; circles stand alone. Pieces that meet within `tol` are joined. */
export function runsOf(pieces: readonly Piece[], tol = 1e-4): { items: Exclude<Piece, { k: "circle" }>[]; closed: boolean }[] {
  const left: Exclude<Piece, { k: "circle" }>[] = [];
  const out: { items: Exclude<Piece, { k: "circle" }>[]; closed: boolean }[] = [];
  for (const p of pieces) { const q = p.k === "arc" ? asCircle(p, tol) : p; if (q.k !== "circle") left.push(q); }
  const flip = (p: Exclude<Piece, { k: "circle" }>): Exclude<Piece, { k: "circle" }> => (p.k === "seg" ? { k: "seg", p: p.q, q: p.p } : { ...p, p: p.q, q: p.p, ccw: !p.ccw });
  while (left.length) {
    const items = [left.shift()!];
    for (let grew = true; grew; ) {
      grew = false;
      const [first, last] = [items[0]!, items[items.length - 1]!];
      if (items.length > 1 && same(first.p, last.q, tol)) break; // (it has come round)
      for (let i = 0; i < left.length; i++) {
        const p = left[i]!;
        if (same(last.q, p.p, tol)) { items.push(p); left.splice(i, 1); grew = true; break; }
        if (same(last.q, p.q, tol)) { items.push(flip(p)); left.splice(i, 1); grew = true; break; }
        if (same(first.p, p.q, tol)) { items.unshift(p); left.splice(i, 1); grew = true; break; }
        if (same(first.p, p.p, tol)) { items.unshift(flip(p)); left.splice(i, 1); grew = true; break; }
      }
    }
    out.push({ items, closed: items.length > 1 && same(items[0]!.p, items[items.length - 1]!.q, tol) || (items.length === 1 && items[0]!.k === "arc" && false) });
  }
  return out;
}

/** The corners of the box round everything (arcs and circles by their whole circles' extreme points on the arc), or null for nothing. */
export function boundsOf(pieces: readonly Piece[]): { min: V2; max: V2 } | null {
  const pts: V2[] = [];
  for (const p of pieces) {
    if (p.k === "seg") pts.push(p.p, p.q);
    else if (p.k === "circle") pts.push([p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]);
    else {
      pts.push(p.p, p.q);
      const a0 = Math.atan2(p.p[1] - p.c[1], p.p[0] - p.c[0]);
      const s = sweepOf(p);
      for (let k = 0; k < 4; k++) { // (the extreme points of the circle that the arc passes through)
        const target = (k * Math.PI) / 2;
        const d = s >= 0 ? (((target - a0) % TAU) + TAU) % TAU : -((((a0 - target) % TAU) + TAU) % TAU);
        if (Math.abs(d) <= Math.abs(s)) pts.push([p.c[0] + p.r * Math.cos(target), p.c[1] + p.r * Math.sin(target)]);
      }
    }
  }
  if (!pts.length) return null;
  return { min: [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1]))], max: [Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))] };
}

/** The pieces in other units: every length times `k` (a millimetre drawing in inches is `1 / 25.4`). */
export function scaledPieces(pieces: readonly Piece[], k: number): Piece[] {
  const v = (p: V2): V2 => [p[0] * k, p[1] * k];
  return pieces.map((p): Piece => (p.k === "seg" ? { ...p, p: v(p.p), q: v(p.q) } : p.k === "circle" ? { ...p, c: v(p.c), r: p.r * k } : { ...p, c: v(p.c), r: p.r * k, p: v(p.p), q: v(p.q) }));
}

/** The pieces moved by `by`. */
export function movedPieces(pieces: readonly Piece[], by: V2): Piece[] {
  const v = (p: V2): V2 => [p[0] + by[0], p[1] + by[1]];
  return pieces.map((p): Piece => (p.k === "seg" ? { ...p, p: v(p.p), q: v(p.q) } : p.k === "circle" ? { ...p, c: v(p.c) } : { ...p, c: v(p.c), p: v(p.p), q: v(p.q) }));
}

/** The SVG: millimetres (the file's width and height are in mm so a laser or vinyl program sizes it right), no fill, a thin black line, one path for each run and a circle for each circle. */
export function svgText(pieces0: readonly Piece[], title: string, units: "mm" | "in" = "mm"): string {
  const k = units === "in" ? 1 / 25.4 : 1; // (the pieces are in millimetres; an inch drawing has its numbers in inches and says so in its width and height)
  const pieces = k === 1 ? pieces0 : scaledPieces(pieces0, k);
  const b = boundsOf(pieces) ?? { min: [0, 0] as V2, max: [1, 1] as V2 };
  const pad = k; // (a millimetre of margin so the line at the edge is not cut)
  const [x0, y0, w, h] = [b.min[0] - pad, -b.max[1] - pad, b.max[0] - b.min[0] + 2 * pad, b.max[1] - b.min[1] + 2 * pad];
  const P = (q: V2): string => `${num(q[0])} ${num(-q[1])}`;
  const elements = (ps: readonly Piece[]): string[] => {
    const els: string[] = [];
    for (const run of runsOf(ps)) {
      let d = `M ${P(run.items[0]!.p)}`;
      for (const it of run.items) {
        if (it.k === "seg") d += ` L ${P(it.q)}`;
        else { const s = sweepOf(it); d += ` A ${num(it.r)} ${num(it.r)} 0 ${Math.abs(s) > Math.PI ? 1 : 0} ${s > 0 ? 0 : 1} ${P(it.q)}`; } // (y turned over: counter-clockwise is sweep 0)
      }
      els.push(`<path d="${d}${run.closed ? " Z" : ""}"/>`);
    }
    for (const p of ps) {
      const c = p.k === "circle" ? p : p.k === "arc" ? asCircle(p, 1e-4) : null;
      if (c && c.k === "circle") els.push(`<circle cx="${num(c.c[0])}" cy="${num(-c.c[1])}" r="${num(c.r)}"/>`);
    }
    return els;
  };
  const stroke = `fill="none" stroke-width="${num(0.1 * k)}" stroke-linecap="round" stroke-linejoin="round"`;
  // with layers: a group for each, named for the layer (Inkscape reads the id as the layer's name with `inkscape:groupmode`) and drawn in its colour; without, one black group as before
  const body = hasLayers(pieces)
    ? LAYERS.flatMap((l) => { const ps = pieces.filter((p) => (p.layer ?? "cut") === l.name); return ps.length ? [`<g id="${l.name}" inkscape:groupmode="layer" inkscape:label="${l.name}" stroke="${l.svg}" ${stroke}>\n${elements(ps).join("\n")}\n</g>`] : []; }).join("\n")
    : `<g stroke="#000000" ${stroke}>\n${elements(pieces).join("\n")}\n</g>`;
  const esc = title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const ns = hasLayers(pieces) ? ` xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"${ns} width="${num(w)}${units === "in" ? "in" : "mm"}" height="${num(h)}${units === "in" ? "in" : "mm"}" viewBox="${num(x0)} ${num(y0)} ${num(w)} ${num(h)}">\n<title>${esc}</title>\n${body}\n</svg>\n`;
}

/** The DXF: the old plain form (AC1009) that every program reads, millimetres, one LINE, ARC or CIRCLE for each piece; an arc always runs counter-clockwise in DXF, so a clockwise one is written from its other end. */
export function dxfText(pieces0: readonly Piece[], units: "mm" | "in" = "mm"): string {
  const pieces = units === "in" ? scaledPieces(pieces0, 1 / 25.4) : pieces0;
  const g: string[] = [];
  const add = (code: number, value: string | number) => { g.push(String(code), typeof value === "number" ? num(value) : value); };
  add(0, "SECTION"); add(2, "HEADER"); add(9, "$ACADVER"); add(1, "AC1009"); add(9, "$INSUNITS"); add(70, units === "in" ? 1 : 4); add(0, "ENDSEC");
  const layered = hasLayers(pieces);
  if (layered) { // (a table of the layers, each in its colour: the names are the ones the SVG uses)
    const used = LAYERS.filter((l) => pieces.some((p) => (p.layer ?? "cut") === l.name));
    add(0, "SECTION"); add(2, "TABLES");
    add(0, "TABLE"); add(2, "LTYPE"); add(70, 1); add(0, "LTYPE"); add(2, "CONTINUOUS"); add(70, 0); add(3, "Solid line"); add(72, 65); add(73, 0); add(40, 0); add(0, "ENDTAB");
    add(0, "TABLE"); add(2, "LAYER"); add(70, used.length);
    for (const l of used) { add(0, "LAYER"); add(2, l.name.toUpperCase()); add(70, 0); add(62, l.aci); add(6, "CONTINUOUS"); }
    add(0, "ENDTAB"); add(0, "ENDSEC");
  }
  add(0, "SECTION"); add(2, "ENTITIES");
  const deg = (r: number): number => ((r * 180) / Math.PI + 360) % 360;
  for (const raw of pieces) {
    const p = raw.k === "arc" ? asCircle(raw, 1e-4) : raw;
    add(0, p.k === "seg" ? "LINE" : p.k === "circle" ? "CIRCLE" : "ARC"); add(8, layered ? (p.layer ?? "cut").toUpperCase() : "0");
    if (p.k === "seg") { add(10, p.p[0]); add(20, p.p[1]); add(30, 0); add(11, p.q[0]); add(21, p.q[1]); add(31, 0); }
    else if (p.k === "circle") { add(10, p.c[0]); add(20, p.c[1]); add(30, 0); add(40, p.r); }
    else {
      const [from, to] = p.ccw ? [p.p, p.q] : [p.q, p.p];
      add(10, p.c[0]); add(20, p.c[1]); add(30, 0); add(40, p.r);
      add(50, deg(Math.atan2(from[1] - p.c[1], from[0] - p.c[0]))); add(51, deg(Math.atan2(to[1] - p.c[1], to[0] - p.c[0])));
    }
  }
  add(0, "ENDSEC"); add(0, "EOF");
  return g.join("\n") + "\n";
}
