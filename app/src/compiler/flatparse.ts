// Reading SVG and DXF drawings into flat pieces (`dec_import`): lines, circular arcs and circles in millimetres, x to the right and y up. What the app has no piece for (curves of other kinds, text) is flattened into short lines or left
// out, and the notes say so. Pure text in, pieces out; no DOM, so it runs in a test and on any platform.
import type { Piece, V2 } from "./flatfile.ts";

export type Parsed = { ok: true; pieces: Piece[]; notes: string[] } | { ok: false; error: string };
const TAU = Math.PI * 2;
const MAX_PIECES = 20000;

// ---------- shared geometry ----------
/** The arc of a polyline corner with a DXF bulge (the tangent of a quarter of the turn; positive counter-clockwise) between `p` and `q`. */
function bulgeArc(p: V2, q: V2, b: number): Piece {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12 || Math.abs(b) < 1e-9) return { k: "seg", p, q };
  const [nx, ny] = [-dy / chord, dx / chord]; // (left of the way p goes to q)
  const d = (chord / 2) * (1 - b * b) / (2 * b);
  const c: V2 = [(p[0] + q[0]) / 2 + nx * d, (p[1] + q[1]) / 2 + ny * d];
  return { k: "arc", c, r: Math.hypot(p[0] - c[0], p[1] - c[1]), p, q, ccw: b > 0 };
}
const polyline = (pts: V2[], closed: boolean): Piece[] => {
  const out: Piece[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const [p, q] = [pts[i]!, pts[(i + 1) % pts.length]!]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push({ k: "seg", p, q }); }
  return out;
};
/** Points along an ellipse (centre, the major radius vector, the minor over major ratio) from parameter `t0` to `t1`, finely enough that the line is within 0.01 mm of the curve. */
function ellipsePoints(c: V2, major: V2, ratio: number, t0: number, t1: number): V2[] {
  const a = Math.hypot(major[0], major[1]);
  const rot = Math.atan2(major[1], major[0]);
  const n = Math.max(12, Math.min(720, Math.ceil(Math.abs(t1 - t0) / (2 * Math.acos(Math.max(0, 1 - 0.01 / Math.max(a, 0.02)))))));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    const [x, y] = [a * Math.cos(t), a * ratio * Math.sin(t)];
    return [c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)] as V2;
  });
}
const pieceCount = (n: number): string | null => (n > MAX_PIECES ? `this drawing has more than ${MAX_PIECES.toLocaleString("en-US")} pieces: too many to import` : null);

// ---------- DXF ----------
const DXF_UNITS: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100, 15: 10000 };

/** Pieces of an ASCII DXF: LINE, CIRCLE, ARC, LWPOLYLINE and POLYLINE (with bulges), ELLIPSE and SPLINE (flattened); in the file's own units turned into millimetres. Blocks, inserts, text, hatches and 3D entities are left out and said. */
/** The kind of value a group code carries in a binary DXF (the same ranges as in the ASCII file's documentation): a string ends with a zero byte, the others are 2, 4 or 8 byte numbers or one byte. */
const binaryKind = (c: number): "str" | "f64" | "i16" | "i32" | "i64" | "u8" | "chunk" => {
  if (c <= 9 || (c >= 100 && c <= 102) || c === 105 || (c >= 300 && c <= 309) || (c >= 320 && c <= 369) || (c >= 390 && c <= 399) || (c >= 410 && c <= 419) || (c >= 430 && c <= 439) || (c >= 470 && c <= 481) || c === 999 || (c >= 1000 && c <= 1009)) return "str";
  if ((c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239) || (c >= 460 && c <= 469) || (c >= 1010 && c <= 1059)) return "f64";
  if ((c >= 60 && c <= 79) || (c >= 170 && c <= 179) || (c >= 270 && c <= 289) || (c >= 370 && c <= 389) || (c >= 400 && c <= 409) || (c >= 1060 && c <= 1070)) return "i16";
  if ((c >= 90 && c <= 99) || (c >= 420 && c <= 429) || (c >= 440 && c <= 459) || c === 1071) return "i32";
  if (c >= 160 && c <= 169) return "i64";
  if (c >= 290 && c <= 299) return "u8";
  if (c >= 310 && c <= 319) return "chunk";
  return "i16";
};

/** The ASCII DXF text of a binary DXF file (the 22 byte sentinel `AutoCAD Binary DXF`, then group codes and values), so that one reader reads both; or why the file cannot be read. */
export function binaryDxfText(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 18));
  if (head !== "AutoCAD Binary DXF") return { ok: false, error: "this is not a binary DXF file" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: string[] = [];
  const cut = { ok: false as const, error: "this binary DXF file is cut short (it ends in the middle of a value)" };
  const have = (at: number, n: number): boolean => at + n <= bytes.length;
  // the version (header variable $ACADVER, "AC1009" is R12) says how a group code is written: R12 one byte (255 and then two bytes for the big ones), R13 and later always two bytes
  const first = new TextDecoder("latin1").decode(bytes.subarray(22, Math.min(bytes.length, 1024)));
  const ver = /\$ACADVER\0[\s\S]{1,2}(AC\d{4})/.exec(first)?.[1] ?? "AC1009";
  const text = new TextDecoder(ver >= "AC1021" ? "utf-8" : "latin1"); // (strings are UTF-8 from 2007 on, else the file's code page: Latin-1 stands for it)
  let at = 22;
  while (at < bytes.length) {
    let code: number;
    if (ver > "AC1009") { if (!have(at, 2)) return cut; code = view.getUint16(at, true); at += 2; }
    else { code = bytes[at++]!; if (code === 255) { if (!have(at, 2)) return cut; code = view.getUint16(at, true); at += 2; } }
    const kind = binaryKind(code);
    let value: string;
    if (kind === "str") {
      let end = at; while (end < bytes.length && bytes[end] !== 0) end++;
      if (end >= bytes.length) return cut;
      value = text.decode(bytes.subarray(at, end)); at = end + 1;
    } else if (kind === "f64") { if (!have(at, 8)) return cut; value = String(view.getFloat64(at, true)); at += 8; }
    else if (kind === "i16") { if (!have(at, 2)) return cut; value = String(view.getInt16(at, true)); at += 2; }
    else if (kind === "i32") { if (!have(at, 4)) return cut; value = String(view.getInt32(at, true)); at += 4; }
    else if (kind === "i64") { if (!have(at, 8)) return cut; value = String(view.getBigInt64(at, true)); at += 8; }
    else if (kind === "u8") { if (!have(at, 1)) return cut; value = String(bytes[at]); at += 1; }
    else { if (!have(at, 1)) return cut; const n = bytes[at]!; at += 1; if (!have(at, n)) return cut; value = [...bytes.subarray(at, at + n)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase(); at += n; }
    out.push(String(code), value);
  }
  return { ok: true, text: out.join("\n") + "\n" };
}

export function parseDxf(text: string, opts: { unitMm?: number } = {}): Parsed {
  if (/^AutoCAD Binary DXF/.test(text)) return { ok: false, error: "this is a binary DXF: it is read from the file's bytes (Import), not from text" };
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const code = Number(lines[i]!.trim()); if (!Number.isFinite(code)) return { ok: false, error: "this is not a DXF file (the pairs of lines are not group codes and values)" }; pairs.push([code, lines[i + 1]!.trim()]); }
  if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) return { ok: false, error: "this is not a DXF file (no SECTION in it)" };
  let unit = 1;
  for (let i = 0; i < pairs.length; i++) if (pairs[i]![0] === 9 && pairs[i]![1] === "$INSUNITS") { const v = pairs.slice(i + 1, i + 4).find(([c]) => c === 70); if (v) unit = DXF_UNITS[Number(v[1])] ?? 1; break; }
  if (opts.unitMm) unit = opts.unitMm; // (the person's choice over what the file says)
  // the entities section only
  const start = pairs.findIndex(([c, v], i) => c === 0 && v === "SECTION" && pairs[i + 1]?.[0] === 2 && pairs[i + 1]?.[1] === "ENTITIES");
  if (start < 0) return { ok: false, error: "this DXF has no ENTITIES section" };
  type Ent = { type: string; g: [number, string][] };
  const ents: Ent[] = [];
  for (let i = start + 2; i < pairs.length; i++) {
    const [c, v] = pairs[i]!;
    if (c === 0 && v === "ENDSEC") break;
    if (c === 0) ents.push({ type: v, g: [] }); else ents.at(-1)?.g.push([c, v]);
  }
  // blocks (BLOCKS section): each with the base point the inserts put at their own point
  const blocks = new Map<string, { base: V2; ents: Ent[] }>();
  const bstart = pairs.findIndex(([c, v], i) => c === 0 && v === "SECTION" && pairs[i + 1]?.[0] === 2 && pairs[i + 1]?.[1] === "BLOCKS");
  if (bstart >= 0) {
    let cur: { name: string; base: V2; ents: Ent[] } | null = null;
    let head: Ent | null = null;
    for (let i = bstart + 2; i < pairs.length; i++) {
      const [c, v] = pairs[i]!;
      if (c === 0 && v === "ENDSEC") break;
      if (c === 0 && v === "BLOCK") { head = { type: v, g: [] }; cur = null; continue; }
      if (c === 0 && v === "ENDBLK") { if (cur) blocks.set(cur.name, cur); cur = null; head = null; continue; }
      if (head && !cur) {
        if (c === 0) { cur = { name: String(head.g.find(([k]) => k === 2)?.[1] ?? ""), base: [Number(head.g.find(([k]) => k === 10)?.[1] ?? 0), Number(head.g.find(([k]) => k === 20)?.[1] ?? 0)], ents: [] }; cur.ents.push({ type: v, g: [] }); }
        else head.g.push([c, v]);
      } else if (cur) { if (c === 0) cur.ents.push({ type: v, g: [] }); else cur.ents.at(-1)?.g.push([c, v]); }
    }
  }
  // layers that are switched off or frozen (the LAYER table: 70 bit 1 is frozen, a negative colour 62 is off): what is on them is not drawn, so it is not imported
  const hiddenLayers = new Set<string>();
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]![0] !== 0 || pairs[i]![1] !== "LAYER") continue;
    let [name, flags, color] = ["", 0, 1];
    for (let j = i + 1; j < pairs.length && pairs[j]![0] !== 0; j++) { const [c, v] = pairs[j]!; if (c === 2) name = v; else if (c === 70) flags = Number(v); else if (c === 62) color = Number(v); }
    if (name && ((flags & 1) === 1 || color < 0)) hiddenLayers.add(name);
  }
  const notes: string[] = [];
  const left: Record<string, number> = {};
  const S = (p: V2): V2 => [p[0] * unit, p[1] * unit];
  const num = (e: { g: [number, string][] }, code: number, d = 0): number => { const f = e.g.find(([c]) => c === code); return f ? Number(f[1]) : d; };
  const all = (e: { g: [number, string][] }, code: number): number[] => e.g.filter(([c]) => c === code).map(([, v]) => Number(v));
  void all;
  let flattened = 0, hidden = 0, placed = 0;
  /** A piece moved by a matrix (a b c d e f, x' = a x + c y + e): arcs and circles stay so under a turn, a mirror and an even scale; under an uneven scale they would be ellipses, so they are flattened into short lines. */
  const mapPiece = (pc: Piece, m: M): Piece[] => {
    const [u, w] = [Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])];
    const similar = Math.abs(u - w) < 1e-9 * Math.max(u, w, 1) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * Math.max(u * w, 1);
    const ap = (p: V2): V2 => apply(m, p);
    if (pc.k === "seg") return [{ k: "seg", p: ap(pc.p), q: ap(pc.q) }];
    if (similar) return pc.k === "circle" ? [{ k: "circle", c: ap(pc.c), r: pc.r * u }] : [{ k: "arc", c: ap(pc.c), r: pc.r * u, p: ap(pc.p), q: ap(pc.q), ccw: m[0] * m[3] - m[1] * m[2] > 0 ? pc.ccw : !pc.ccw }];
    flattened++;
    const [a0, a1] = pc.k === "circle" ? [0, TAU] : [Math.atan2(pc.p[1] - pc.c[1], pc.p[0] - pc.c[0]), Math.atan2(pc.q[1] - pc.c[1], pc.q[0] - pc.c[0])];
    let sweep = a1 - a0;
    if (pc.k === "circle") sweep = TAU; else if (pc.ccw) { while (sweep <= 1e-12) sweep += TAU; } else { while (sweep >= -1e-12) sweep -= TAU; }
    const n = Math.max(12, Math.min(720, Math.ceil(Math.abs(sweep) / (2 * Math.acos(Math.max(0, 1 - 0.01 / Math.max(pc.r * Math.max(u, w), 0.02)))))));
    const pts = Array.from({ length: n + 1 }, (_, i) => ap([pc.c[0] + pc.r * Math.cos(a0 + (sweep * i) / n), pc.c[1] + pc.r * Math.sin(a0 + (sweep * i) / n)]));
    return polyline(pts, pc.k === "circle");
  };
  const emit = (list: Ent[], depth: number): Piece[] => {
  const pieces: Piece[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (hiddenLayers.size && hiddenLayers.has(String(e.g.find(([c]) => c === 8)?.[1] ?? ""))) { if (e.type !== "VERTEX" && e.type !== "SEQEND") hidden++; continue; }
    if (e.type === "LINE") { const [p, q] = [S([num(e, 10), num(e, 20)]), S([num(e, 11), num(e, 21)])]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) pieces.push({ k: "seg", p, q }); }
    else if (e.type === "CIRCLE") pieces.push({ k: "circle", c: S([num(e, 10), num(e, 20)]), r: num(e, 40) * unit });
    else if (e.type === "ARC") {
      const [c, r, a0, a1] = [S([num(e, 10), num(e, 20)]), num(e, 40) * unit, (num(e, 50) * Math.PI) / 180, (num(e, 51) * Math.PI) / 180];
      pieces.push({ k: "arc", c, r, p: [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], q: [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)], ccw: true });
    } else if (e.type === "LWPOLYLINE") {
      // each vertex starts with its 10; the 42 that follows is the bulge of the corner to the next vertex
      const verts: { p: V2; b: number }[] = [];
      for (const [c, v] of e.g) { if (c === 10) verts.push({ p: [Number(v) * unit, 0], b: 0 }); else if (c === 20 && verts.length) verts.at(-1)!.p[1] = Number(v) * unit; else if (c === 42 && verts.length) verts.at(-1)!.b = Number(v); }
      const closed = (num(e, 70) & 1) === 1;
      const n = closed ? verts.length : verts.length - 1;
      for (let k = 0; k < n; k++) pieces.push(bulgeArc(verts[k]!.p, verts[(k + 1) % verts.length]!.p, verts[k]!.b));
    } else if (e.type === "POLYLINE") {
      const verts: { p: V2; b: number }[] = [];
      let j = i + 1;
      while (j < list.length && list[j]!.type === "VERTEX") { verts.push({ p: S([num(list[j]!, 10), num(list[j]!, 20)]), b: num(list[j]!, 42) }); j++; }
      const closed = (num(e, 70) & 1) === 1;
      const n = closed ? verts.length : verts.length - 1;
      for (let k = 0; k < n; k++) pieces.push(bulgeArc(verts[k]!.p, verts[(k + 1) % verts.length]!.p, verts[k]!.b));
      i = j - (list[j]?.type === "SEQEND" ? 0 : 1);
    } else if (e.type === "VERTEX" || e.type === "SEQEND") continue;
    else if (e.type === "ELLIPSE") {
      const [c, major, ratio, t0, t1] = [S([num(e, 10), num(e, 20)]), S([num(e, 11), num(e, 21)]), num(e, 40, 1), num(e, 41, 0), num(e, 42, TAU)];
      const pts = ellipsePoints(c, major, ratio, t0, t1 > t0 ? t1 : t1 + TAU);
      pieces.push(...polyline(pts, Math.abs((t1 > t0 ? t1 : t1 + TAU) - t0 - TAU) < 1e-9));
      flattened++;
    } else if (e.type === "SPLINE") {
      const pts = splinePoints(e.g, unit);
      if (pts) { pieces.push(...polyline(pts, false)); flattened++; } else left.SPLINE = (left.SPLINE ?? 0) + 1;
    }
    else if (e.type === "INSERT") {
      const def = blocks.get(String(e.g.find(([c]) => c === 2)?.[1] ?? ""));
      const [cols, rows] = [Math.max(1, Math.round(num(e, 70, 1))), Math.max(1, Math.round(num(e, 71, 1)))];
      if (!def) left.INSERT = (left.INSERT ?? 0) + 1;
      else if (depth >= 8 || cols * rows > 10000) left["INSERT (nested too deep, or an array too large)"] = (left["INSERT (nested too deep, or an array too large)"] ?? 0) + 1;
      else {
        const inner = emit(def.ents, depth + 1);
        const [sx, sy, r] = [num(e, 41, 1), num(e, 42, 1), (num(e, 50) * Math.PI) / 180];
        const [co, si] = [Math.cos(r), Math.sin(r)];
        const [a, b, c, d] = [co * sx, si * sx, -si * sy, co * sy];
        const [bx, by] = S(def.base);
        for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
          const off = [cc * num(e, 44), rr * num(e, 45)] as V2; // (spacing is in the insert's own turned frame)
          const pos = S([num(e, 10) + co * off[0] - si * off[1], num(e, 20) + si * off[0] + co * off[1]]);
          const m: M = [a, b, c, d, pos[0] - (a * bx + c * by), pos[1] - (b * bx + d * by)];
          for (const pc of inner) pieces.push(...mapPiece(pc, m));
          placed++;
          if (pieces.length > MAX_PIECES) break;
        }
      }
    }
    else left[e.type] = (left[e.type] ?? 0) + 1;
    if (pieces.length > MAX_PIECES) break;
  }
  return pieces;
  };
  const pieces = emit(ents, 0);
  const big = pieceCount(pieces.length);
  if (big) return { ok: false, error: big };
  if (flattened) notes.push(`${flattened} curve${flattened === 1 ? "" : "s"} (ellipses, splines) turned into short lines: the app has no such curves yet`);
  if (placed) notes.push(`${placed} block insert${placed === 1 ? "" : "s"} placed where the file puts ${placed === 1 ? "it" : "them"}`);
  if (hidden) notes.push(`${hidden} piece${hidden === 1 ? "" : "s"} on switched-off or frozen layers left out`);
  const skipped = Object.entries(left).map(([k, n]) => `${n} ${k}`).join(", ");
  if (skipped) notes.push(`left out: ${skipped}`);
  if (opts.unitMm) unit = opts.unitMm;
  if (unit !== 1) notes.push(`${opts.unitMm ? "the units you chose" : "the file's units"} were converted to millimetres (×${unit})`);
  return pieces.length ? { ok: true, pieces, notes } : { ok: false, error: `no lines, arcs or circles were found in this DXF${skipped ? ` (it has ${skipped})` : ""}` };
}

/** A smooth curve through the points (centripetal Catmull-Rom, which does not loop or overshoot at uneven spacing), sampled finely. */
function smoothThrough(pts: V2[]): V2[] {
  if (pts.length < 3) return pts;
  const out: V2[] = [pts[0]!];
  const knot = (a: V2, b: V2, t: number): number => t + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)]!, pts[i]!, pts[i + 1]!, pts[Math.min(pts.length - 1, i + 2)]!];
    const [t0, t1, t2, t3] = [0, knot(p0, p1, 0), 0, 0];
    const t2k = knot(p1, p2, t1), t3k = knot(p2, p3, t2k);
    void t2; void t3;
    const n = 16;
    for (let k = 1; k <= n; k++) {
      const t = t1 + ((t2k - t1) * k) / n;
      const lerp = (a: V2, b: V2, ta: number, tb: number): V2 => (tb - ta < 1e-12 ? a : [a[0] + ((b[0] - a[0]) * (t - ta)) / (tb - ta), a[1] + ((b[1] - a[1]) * (t - ta)) / (tb - ta)]);
      const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2k), a3 = lerp(p2, p3, t2k, t3k);
      const b1 = lerp(a1, a2, t0, t2k), b2 = lerp(a2, a3, t1, t3k);
      out.push(lerp(b1, b2, t1, t2k));
    }
  }
  return out;
}

/** Points along a DXF SPLINE (a B-spline: degree 71, knots 40, control points 10 / 20), or null when it is not well formed. */
function splinePoints(g: [number, string][], unit: number): V2[] | null {
  const deg = Number(g.find(([c]) => c === 71)?.[1] ?? 3);
  const knots = g.filter(([c]) => c === 40).map(([, v]) => Number(v));
  const ctl: V2[] = [];
  for (const [c, v] of g) { if (c === 10) ctl.push([Number(v) * unit, 0]); else if (c === 20 && ctl.length) ctl.at(-1)![1] = Number(v) * unit; }
  const fit: V2[] = [];
  for (const [c, v] of g) { if (c === 11) fit.push([Number(v) * unit, 0]); else if (c === 21 && fit.length) fit.at(-1)![1] = Number(v) * unit; }
  if (knots.length !== ctl.length + deg + 1 || ctl.length <= deg) return fit.length > 1 ? smoothThrough(fit) : null; // (no usable control polygon: a smooth curve through the points it was fitted through)
  const [t0, t1] = [knots[deg]!, knots[ctl.length]!];
  const n = Math.max(24, Math.min(400, ctl.length * 16));
  const at = (t: number): V2 => {
    let k = deg;
    while (k < ctl.length - 1 && t >= knots[k + 1]!) k++;
    const d = ctl.slice(k - deg, k + 1).map((p) => [...p] as V2);
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const den = knots[j + 1 + k - r]! - knots[j + k - deg]!;
      const a = den === 0 ? 0 : (t - knots[j + k - deg]!) / den;
      d[j] = [(1 - a) * d[j - 1]![0] + a * d[j]![0], (1 - a) * d[j - 1]![1] + a * d[j]![1]];
    }
    return d[deg]!;
  };
  return Array.from({ length: n + 1 }, (_, i) => at(i === n ? t1 - 1e-9 * (t1 - t0) : t0 + ((t1 - t0) * i) / n));
}

// ---------- SVG ----------
type M = [number, number, number, number, number, number]; // a b c d e f: x' = a x + c y + e, y' = b x + d y + f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, p: V2): V2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const nums = (t: string): number[] => (t.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

function transformOf(t: string | undefined): M {
  let m = I;
  for (const [, name, args] of (t ?? "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(args!);
    let n: M | null = null;
    if (name === "matrix" && a.length === 6) n = a as M;
    else if (name === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (name === "scale") n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (name === "rotate") { const r = ((a[0] ?? 0) * Math.PI) / 180; const R: M = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; n = a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1]!, a[2]!], R), [1, 0, 0, 1, -a[1]!, -a[2]!]) : R; }
    else if (name === "skewX") n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === "skewY") n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    if (n) m = mul(m, n);
  }
  return m;
}
/** A length with its unit in millimetres, or null (percentages and nothing). */
function lengthMm(v: string | undefined): number | null {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(mm|cm|in|pt|pc|px|q)?\s*$/i.exec(v ?? "");
  if (!m) return null;
  const k = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, q: 0.25, "": 25.4 / 96 }[(m[2] ?? "").toLowerCase() as "mm"]!;
  return Number(m[1]) * k;
}
const attrsOf = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = m[2] ?? m[3] ?? "";
  return out;
};

/** Pieces of an SVG: path, line, polyline, polygon, rect (rounded too), circle and ellipse, with the transforms of the groups; circles and circular arcs stay circles and arcs (also under a uniform scale or a turn), Béziers and ellipses are flattened. The user unit is a pixel (1/96 inch) unless the width, height and viewBox say otherwise; the drawing's own origin stays the origin and y is turned up. */
export function parseSvg(text: string, opts: { unitMm?: number } = {}): Parsed {
  if (!/<svg[\s>]/i.test(text)) return { ok: false, error: "this is not an SVG file (no <svg> in it)" };
  const notes: string[] = [];
  const pieces: Piece[] = [];
  const left: Record<string, number> = {};
  let flattened = 0;
  let unit = 25.4 / 96;
  const byId = (id: string): string | null => { // the text of the element with this id (its whole extent, children included), for <use>
    const open = new RegExp(`<([\\w:-]+)\\b[^>]*\\bid\\s*=\\s*(?:"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"|'${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}')[^>]*>`).exec(text);
    if (!open) return null;
    if (open[0].endsWith("/>")) return open[0];
    const tagName = open[1]!;
    let depth = 1;
    for (const t of text.slice(open.index + open[0].length).matchAll(new RegExp(`<(/?)${tagName}\\b[^>]*?(/?)>`, "g"))) {
      if (t[1] === "/") depth--; else if (t[2] !== "/") depth++;
      if (depth === 0) return text.slice(open.index, open.index + open[0].length + t.index! + t[0].length);
    }
    return null;
  };
  let uses = 0;
  const walk = (src: string, base: M, depth: number): void => {
  const stack: { name: string; m: M; skip: boolean }[] = [];
  for (const tag of src.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!\w[^>]*>|<(\/?)([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    if (tag[2] === undefined) continue;
    const [closing, name, rest, selfClose] = [tag[1] === "/", tag[2].toLowerCase().replace(/^svg:/, ""), tag[3] ?? "", tag[4] === "/"];
    if (closing) { stack.pop(); continue; }
    const at = attrsOf(rest);
    const parent = stack.at(-1);
    let m = parent ? parent.m : base;
    let skip = parent?.skip ?? false;
    if (name === "svg" && !parent && depth === 0) {
      const [w, h] = [lengthMm(at.width), lengthMm(at.height)];
      const vb = nums(at.viewBox ?? "");
      if (vb.length === 4 && w && h && vb[2]! > 0 && vb[3]! > 0) unit = Math.min(w / vb[2]!, h / vb[3]!);
      else if (vb.length === 4 && w && vb[2]! > 0) unit = w / vb[2]!;
      if (opts.unitMm) unit = opts.unitMm; // (the person's choice over what the file says: a user unit is this much)
    }
    if (["defs", "clippath", "mask", "symbol", "pattern", "marker", "style", "script", "title", "desc", "metadata", "text", "image", "foreignobject"].includes(name)) { skip = true; if (["text", "image"].includes(name)) left[name] = (left[name] ?? 0) + 1; }
    if (at.transform) m = mul(m, transformOf(at.transform));
    if (at.display === "none" || /display\s*:\s*none/i.test(at.style ?? "") || at.visibility === "hidden" || /visibility\s*:\s*hidden/i.test(at.style ?? "")) skip = true; // (hidden: the element and everything in it)
    if (!selfClose) stack.push({ name, m, skip });
    if (skip) continue;
    const f = (k: string): number => Number(at[k] ?? 0) || 0;
    // user space to millimetres, y up: a scale and a turn over of y, after the element's own transform
    const to: M = mul([unit, 0, 0, -unit, 0, 0], m);
    const sim = Math.abs(to[0] * to[2] + to[1] * to[3]) < 1e-9 * Math.hypot(to[0], to[1]) * Math.hypot(to[2], to[3]) && Math.abs(Math.hypot(to[0], to[1]) - Math.hypot(to[2], to[3])) < 1e-9 * Math.hypot(to[0], to[1]); // (a uniform scale, a turn, a flip: circles stay circles)
    const scaleBy = Math.hypot(to[0], to[1]);
    const flip = to[0] * to[3] - to[1] * to[2] < 0;
    const P = (x: number, y: number): V2 => apply(to, [x, y]);
    const addPoly = (pts: V2[], closed: boolean) => pieces.push(...polyline(pts.map((p) => apply(to, p)), closed));
    const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
      if (rx <= 0 || ry <= 0) return;
      if (sim && Math.abs(rx - ry) < 1e-9 * rx) { pieces.push({ k: "circle", c: P(cx, cy), r: rx * scaleBy }); return; }
      const n = Math.max(24, Math.min(360, Math.ceil(TAU / (2 * Math.acos(Math.max(0, 1 - 0.01 / Math.max(Math.max(rx, ry) * Math.max(Math.hypot(to[0], to[1]), Math.hypot(to[2], to[3])), 0.02)))))));
      const pts = Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((TAU * i) / n), cy + ry * Math.sin((TAU * i) / n)] as V2);
      addPoly(pts, true); flattened++;
    };
    if (name === "line") addPoly([[f("x1"), f("y1")], [f("x2"), f("y2")]], false);
    else if (name === "polyline" || name === "polygon") { const a = nums(at.points ?? ""); const pts: V2[] = []; for (let i = 0; i + 1 < a.length; i += 2) pts.push([a[i]!, a[i + 1]!]); addPoly(pts, name === "polygon"); }
    else if (name === "rect") {
      const [x, y, w, h] = [f("x"), f("y"), f("width"), f("height")];
      let [rx, ry] = [Number(at.rx ?? NaN), Number(at.ry ?? NaN)];
      if (Number.isNaN(rx) && !Number.isNaN(ry)) rx = ry; if (Number.isNaN(ry) && !Number.isNaN(rx)) ry = rx;
      rx = Math.min(Number.isNaN(rx) ? 0 : rx, w / 2); ry = Math.min(Number.isNaN(ry) ? 0 : ry, h / 2);
      if (w <= 0 || h <= 0) continue;
      if (rx > 0 && ry > 0 && sim && Math.abs(rx - ry) < 1e-9) {
        // a rounded rectangle: four sides and four quarter arcs, counter-clockwise on the screen (clockwise in y-down user space)
        const corner = (cx: number, cy: number, a0: number): Piece => { const [p, q] = [P(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)), P(cx + rx * Math.cos(a0 + Math.PI / 2), cy + ry * Math.sin(a0 + Math.PI / 2))]; return { k: "arc", c: P(cx, cy), r: rx * scaleBy, p, q, ccw: !flip }; };
        pieces.push({ k: "seg", p: P(x + rx, y), q: P(x + w - rx, y) }, corner(x + w - rx, y + ry, -Math.PI / 2), { k: "seg", p: P(x + w, y + ry), q: P(x + w, y + h - ry) }, corner(x + w - rx, y + h - ry, 0), { k: "seg", p: P(x + w - rx, y + h), q: P(x + rx, y + h) }, corner(x + rx, y + h - ry, Math.PI / 2), { k: "seg", p: P(x, y + h - ry), q: P(x, y + ry) }, corner(x + rx, y + ry, Math.PI));
      } else { addPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); if (rx > 0) { notes.push("a rounded rectangle that is scaled unevenly was imported with square corners"); } }
    } else if (name === "circle") ellipse(f("cx"), f("cy"), f("r"), f("r"));
    else if (name === "ellipse") ellipse(f("cx"), f("cy"), f("rx"), f("ry"));
    else if (name === "path") {
      const r = pathPieces(at.d ?? "", to, sim, flip, scaleBy);
      pieces.push(...r.pieces);
      flattened += r.flattened;
    } else if (name === "use") {
      // a copy of another element (or a symbol's content), at x and y further, under the use's own transform
      const id = (at.href ?? at["xlink:href"] ?? "").replace(/^#/, "");
      const target = id && depth < 8 && ++uses <= 2000 ? byId(id) : null; // (a use of a use of a use… is bounded in depth and in how many are followed)
      if (!target) left.use = (left.use ?? 0) + 1;
      else {
        const inner = /^<symbol\b/i.test(target) ? target.replace(/^<symbol\b[^>]*>/i, "").replace(/<\/symbol>\s*$/i, "") : target;
        walk(inner.replace(/\bid\s*=\s*("[^"]*"|'[^']*')/, ""), mul(m, [1, 0, 0, 1, f("x"), f("y")]), depth + 1);
        if (pieces.length > MAX_PIECES) return;
      }
    }
    if (pieces.length > MAX_PIECES) break;
  }
  };
  walk(text, I, 0);
  const big = pieceCount(pieces.length);
  if (big) return { ok: false, error: big };
  if (flattened) notes.push(`${flattened} curve${flattened === 1 ? "" : "s"} (curves that are not circular arcs) turned into short lines: the app has no such curves yet`);
  const skipped = Object.entries(left).map(([k, n]) => `${n} ${k}`).join(", ");
  if (skipped) notes.push(`left out: ${skipped}`);
  return pieces.length ? { ok: true, pieces, notes: [...new Set(notes)] } : { ok: false, error: `no lines, arcs or circles were found in this SVG${skipped ? ` (it has ${skipped})` : ""}` };
}

/** The pieces of a path's `d`, in millimetres through `to`: lines and arcs as such (arcs only when the transform keeps circles round and the radii are equal), curves flattened. */
function pathPieces(d: string, to: M, sim: boolean, flip: boolean, scaleBy: number): { pieces: Piece[]; flattened: number } {
  const out: Piece[] = [];
  let flattened = 0;
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0, cmd = "", cur: V2 = [0, 0], start: V2 = [0, 0], lastCtl: V2 | null = null, lastQ: V2 | null = null;
  const P = (p: V2): V2 => apply(to, p);
  const line = (a: V2, b: V2) => { const [p, q] = [P(a), P(b)]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push({ k: "seg", p, q }); };
  const flat = (pts: V2[]) => { for (let k = 0; k + 1 < pts.length; k++) line(pts[k]!, pts[k + 1]!); flattened++; };
  const bez = (p0: V2, p1: V2, p2: V2, p3: V2): V2[] => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    const n = Math.max(8, Math.min(80, Math.ceil((len * Math.max(Math.hypot(to[0], to[1]), Math.hypot(to[2], to[3]))) / 0.4)));
    return Array.from({ length: n + 1 }, (_, k) => { const t = k / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]] as V2; });
  };
  const next = (): number => Number(tokens[i++]);
  const more = (): boolean => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l"; // (more pairs after a move are lines)
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const abs = (x: number, y: number): V2 => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") { if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-9) line(cur, start); cur = start; lastCtl = lastQ = null; if (!more()) continue; else continue; }
    if (!more()) { i++; continue; }
    if (C === "M") { cur = abs(next(), next()); start = cur; lastCtl = lastQ = null; }
    else if (C === "L") { const p = abs(next(), next()); line(cur, p); cur = p; lastCtl = lastQ = null; }
    else if (C === "H") { const x = next(); const p: V2 = [rel ? cur[0] + x : x, cur[1]]; line(cur, p); cur = p; lastCtl = lastQ = null; }
    else if (C === "V") { const y = next(); const p: V2 = [cur[0], rel ? cur[1] + y : y]; line(cur, p); cur = p; lastCtl = lastQ = null; }
    else if (C === "C") { const [c1, c2, p] = [abs(next(), next()), abs(next(), next()), abs(next(), next())]; flat(bez(cur, c1, c2, p)); cur = p; lastCtl = c2; lastQ = null; }
    else if (C === "S") { const c1: V2 = lastCtl ? [2 * cur[0] - lastCtl[0], 2 * cur[1] - lastCtl[1]] : cur; const [c2, p] = [abs(next(), next()), abs(next(), next())]; flat(bez(cur, c1, c2, p)); cur = p; lastCtl = c2; lastQ = null; }
    else if (C === "Q") { const [q, p] = [abs(next(), next()), abs(next(), next())]; flat(bez(cur, [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p)); cur = p; lastQ = q; lastCtl = null; }
    else if (C === "T") { const q: V2 = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur; const p = abs(next(), next()); flat(bez(cur, [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p)); cur = p; lastQ = q; lastCtl = null; }
    else if (C === "A") {
      const [rx0, ry0, rot, large, sweep] = [next(), next(), next(), next(), next()];
      const p = abs(next(), next());
      const arc = svgArc(cur, p, rx0, ry0, rot, large !== 0, sweep !== 0);
      if (!arc) line(cur, p);
      else if (sim && arc.circular) {
        // a circular arc under a transform that keeps circles round: still an arc (user space is y down: sweep 1 is clockwise on screen and counter-clockwise in y up; a flip of the transform turns it over)
        const [a, b] = [P(cur), P(p)];
        out.push({ k: "arc", c: P(arc.c), r: arc.r * scaleBy, p: a, q: b, ccw: (sweep !== 0) !== flip });
      } else flat(arc.points.map((q) => q));
      cur = p; lastCtl = lastQ = null;
    } else { i++; }
  }
  return { pieces: out, flattened };
}

/** An SVG arc by its end points (the endpoint form) as a centre, a radius and, for the flat case, points along it. */
function svgArc(p0: V2, p1: V2, rx0: number, ry0: number, rotDeg: number, large: boolean, sweep: boolean): { c: V2; r: number; circular: boolean; points: V2[] } | null {
  let [rx, ry] = [Math.abs(rx0), Math.abs(ry0)];
  if (rx < 1e-12 || ry < 1e-12 || (Math.abs(p0[0] - p1[0]) < 1e-12 && Math.abs(p0[1] - p1[1]) < 1e-12)) return null;
  const phi = (rotDeg * Math.PI) / 180;
  const [cp, sp] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2];
  const [x1, y1] = [cp * dx + sp * dy, -sp * dx + cp * dy];
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const [cxp, cyp] = [(co * rx * y1) / ry, (-co * ry * x1) / rx];
  const c: V2 = [cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2];
  const ang = (ux: number, uy: number, vx: number, vy: number): number => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dth > 0) dth -= TAU; else if (sweep && dth < 0) dth += TAU;
  const n = Math.max(8, Math.min(360, Math.ceil(Math.abs(dth) / 0.1)));
  const points = Array.from({ length: n + 1 }, (_, k) => { const t = th1 + (dth * k) / n; return [c[0] + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, c[1] + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp] as V2; });
  return { c, r: rx, circular: Math.abs(rx - ry) < 1e-9 * rx, points };
}
