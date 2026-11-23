// The regions of a sketch (E63): the drawn lines, arcs and circles are cut at every crossing and touch into a planar graph; the bounded areas are the regions; a profile is the set of regions that are filled
// (the even-odd rule, or the ones named by a point inside each); its boundary is the edges with a filled region on one side only, traced into loops (outlines and holes). Pure: numbers in, numbers out; no kernel.
// Membership tests (which region a point is in, how many times a ray crosses) use the arcs as polylines of at most 3 degrees; the boundary that comes out is exact (lines and arcs with their own ends).
export type Pt = [number, number];
export type Seg = { name: string } & ({ kind: "line"; a: Pt; b: Pt } | { kind: "arc"; c: Pt; r: number; /** where it starts, radians */ t0: number; /** how far it goes counter-clockwise, in (0, 2 pi] */ sweep: number });
/** one side of a boundary: straight, or an arc (with the point half way along it); `k` of `of` pieces of the named part reach the boundary */
export interface Piece { name: string; k: number; of: number; a: Pt; b: Pt; mid?: Pt; arc?: { c: Pt; r: number } }
export interface Loop { pieces: Piece[]; /** the loop is one whole circle */ whole?: { name: string; c: Pt; r: number }; /** signed: outlines run counter-clockwise */ area: number }
export interface Profile { outer: Loop; holes: Loop[] }
export interface Faces { sample: Pt; area: number; filled: boolean }
export interface Result { profiles: Profile[]; faces: Faces[] }

const TAU = 2 * Math.PI;
const norm = (a: number) => { const r = a % TAU; return r < 0 ? r + TAU : r; };
const hyp = Math.hypot;

interface Piece0 { seg: number; v0: number; v1: number; p0: number; p1: number }
interface Half { piece: number; fwd: boolean; from: number; to: number; ang: number; kappa: number }

export function regions(segs: readonly Seg[], opts: { pick?: readonly Pt[] } = {}): Result {
  const ext = Math.max(1, ...segs.flatMap((s) => (s.kind === "line" ? [...s.a, ...s.b] : [s.c[0] + s.r, s.c[1] + s.r, s.c[0] - s.r, s.c[1] - s.r])).map(Math.abs)), eps = 1e-9 * ext;
  const pointAt = (s: Seg, p: number): Pt => s.kind === "line" ? [s.a[0] + (s.b[0] - s.a[0]) * p, s.a[1] + (s.b[1] - s.a[1]) * p] : [s.c[0] + s.r * Math.cos(s.t0 + p), s.c[1] + s.r * Math.sin(s.t0 + p)];
  const last = (s: Seg) => (s.kind === "line" ? 1 : s.sweep), closed = (s: Seg) => s.kind === "arc" && s.sweep >= TAU - 1e-12;
  const dist2 = (p: Pt, q: Pt) => hyp(p[0] - q[0], p[1] - q[1]);
  // where a point lies along a segment, or null if it is not on it
  const along = (s: Seg, q: Pt): number | null => {
    if (s.kind === "line") {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = hyp(dx, dy); if (L < eps) return null;
      const t = ((q[0] - s.a[0]) * dx + (q[1] - s.a[1]) * dy) / (L * L);
      if (t < -eps / L || t > 1 + eps / L) return null;
      return Math.abs((q[0] - s.a[0]) * dy - (q[1] - s.a[1]) * dx) / L < eps ? Math.min(1, Math.max(0, t)) : null;
    }
    if (Math.abs(dist2(q, s.c) - s.r) > eps) return null;
    let u = norm(Math.atan2(q[1] - s.c[1], q[0] - s.c[0]) - s.t0);
    if (u > TAU - eps / s.r) u = 0;
    if (!closed(s) && u > s.sweep + eps / s.r) return null;
    return u;
  };
  // the candidate places where something is cut: every crossing of two segments, every end
  const cand: Pt[] = [];
  const lineCircle = (l: Extract<Seg, { kind: "line" }>, c: Extract<Seg, { kind: "arc" }>) => {
    const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], fx = l.a[0] - c.c[0], fy = l.a[1] - c.c[1], A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r;
    if (A < eps * eps) return; const D = B * B - 4 * A * C; if (D < -eps * Math.sqrt(A) * 4) return;
    const sq = Math.sqrt(Math.max(0, D)); for (const t of D < eps ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) cand.push([l.a[0] + dx * t, l.a[1] + dy * t]);
  };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.kind === "line") cand.push(s.a, s.b); else cand.push(pointAt(s, 0), ...(closed(s) ? [] : [pointAt(s, s.sweep)]));
    for (let j = i + 1; j < segs.length; j++) {
      const u = segs[j]!;
      if (s.kind === "line" && u.kind === "line") {
        const d1x = s.b[0] - s.a[0], d1y = s.b[1] - s.a[1], d2x = u.b[0] - u.a[0], d2y = u.b[1] - u.a[1], den = d1x * d2y - d1y * d2x;
        if (Math.abs(den) > 1e-14 * hyp(d1x, d1y) * hyp(d2x, d2y)) { const t = ((u.a[0] - s.a[0]) * d2y - (u.a[1] - s.a[1]) * d2x) / den; cand.push([s.a[0] + d1x * t, s.a[1] + d1y * t]); }
      } else if (s.kind === "line" && u.kind === "arc") lineCircle(s, u);
      else if (s.kind === "arc" && u.kind === "line") lineCircle(u, s);
      else if (s.kind === "arc" && u.kind === "arc") {
        const d = dist2(s.c, u.c); if (d < eps || d > s.r + u.r + eps || d < Math.abs(s.r - u.r) - eps) continue;
        const a = (s.r * s.r - u.r * u.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, s.r * s.r - a * a)), ux = (u.c[0] - s.c[0]) / d, uy = (u.c[1] - s.c[1]) / d, mx = s.c[0] + a * ux, my = s.c[1] + a * uy;
        cand.push([mx - h * uy, my + h * ux]); if (h > eps) cand.push([mx + h * uy, my - h * ux]);
      }
    }
  }
  // the vertices: candidates that are the same place are one
  const vx: Pt[] = [], vertex = (p: Pt): number => { for (let i = 0; i < vx.length; i++) if (dist2(vx[i]!, p) < eps * 10) return i; vx.push(p); return vx.length - 1; };
  const pieces: Piece0[] = [];
  segs.forEach((s, si) => {
    const cuts: { p: number; v: number }[] = [];
    for (const q of cand) { const p = along(s, q); if (p !== null) cuts.push({ p, v: vertex(q) }); }
    cuts.sort((a, b) => a.p - b.p);
    const uniq: { p: number; v: number }[] = []; for (const c of cuts) if (!uniq.length || uniq[uniq.length - 1]!.v !== c.v) uniq.push(c);
    if (closed(s)) { if (!uniq.length) return; uniq.push({ p: TAU + uniq[0]!.p, v: uniq[0]!.v }); }
    for (let i = 0; i + 1 < uniq.length; i++) { const a = uniq[i]!, b = uniq[i + 1]!; if (a.v === b.v && !closed(s)) continue; pieces.push({ seg: si, v0: a.v, v1: b.v, p0: a.p, p1: b.p }); }
  });
  // two pieces on the same ground (the same ends, the same curve) are one
  const same = (a: Piece0, b: Piece0) => {
    const s = segs[a.seg]!, t = segs[b.seg]!;
    if (s.kind !== t.kind || !((a.v0 === b.v0 && a.v1 === b.v1) || (a.v0 === b.v1 && a.v1 === b.v0))) return false;
    return s.kind === "line" || dist2(pointAt(s, (a.p0 + a.p1) / 2), pointAt(t, (b.p0 + b.p1) / 2)) < eps * 10;
  };
  const ps: Piece0[] = []; for (const p of pieces) if (!ps.some((q) => same(q, p))) ps.push(p);
  // the polyline of a piece (for the tests of membership)
  const poly = (p: Piece0, fwd = true): Pt[] => { const s = segs[p.seg]!, n = s.kind === "line" ? 1 : Math.max(2, Math.ceil((p.p1 - p.p0) / (Math.PI / 60))), out: Pt[] = []; for (let i = 0; i <= n; i++) out.push(pointAt(s, p.p0 + ((p.p1 - p.p0) * i) / n)); return fwd ? out : out.reverse(); };
  // the half-edges, in order round each vertex
  const halves: Half[] = [];
  ps.forEach((p, i) => {
    const s = segs[p.seg]!;
    const dir = (at: number, fwd: boolean): number => { if (s.kind === "line") { const a = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]); return fwd ? a : a + Math.PI; } const th = s.t0 + at, a = th + Math.PI / 2; return fwd ? a : a + Math.PI; };
    const kap = s.kind === "line" ? 0 : 1 / s.r;
    halves.push({ piece: i, fwd: true, from: p.v0, to: p.v1, ang: dir(p.p0, true), kappa: kap }, { piece: i, fwd: false, from: p.v1, to: p.v0, ang: dir(p.p1, false), kappa: -kap });
  });
  const twin = (h: number) => h ^ 1;
  const out: number[][] = vx.map(() => []); halves.forEach((h, i) => out[h.from]!.push(i));
  const order = (a: number, b: number) => { const d = norm(halves[a]!.ang - halves[b]!.ang); return d < 1e-9 || d > TAU - 1e-9 ? halves[a]!.kappa - halves[b]!.kappa : norm(halves[a]!.ang) - norm(halves[b]!.ang); };
  for (const o of out) o.sort(order);
  const next = (h: number, ok: (g: number) => boolean = () => true): number => { const o = out[halves[h]!.to]!, i = o.indexOf(twin(h)); for (let k = 1; k <= o.length; k++) { const g = o[(i - k + 2 * o.length) % o.length]!; if (ok(g)) return g; } return twin(h); };
  // the cycles: each half-edge is on one; the bounded faces run counter-clockwise (positive area)
  const cyc: number[] = new Array(halves.length).fill(-1), cycles: number[][] = [];
  for (let h = 0; h < halves.length; h++) { if (cyc[h]! >= 0) continue; const id = cycles.length, list: number[] = []; let g = h; do { cyc[g] = id; list.push(g); g = next(g); } while (g !== h && list.length <= halves.length); cycles.push(list); }
  const pts = (list: number[]): Pt[] => list.flatMap((h) => poly(ps[halves[h]!.piece]!, halves[h]!.fwd).slice(0, -1));
  const areaOf = (q: Pt[]) => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i]!, r = q[(i + 1) % q.length]!; a += p[0] * r[1] - r[0] * p[1]; } return a / 2; };
  const inside = (q: Pt[], p: Pt): boolean => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i]!, b = q[j]!; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  // the area of a cycle is exact (Green's theorem along each side: a line, or an arc about its centre), not that of the polygon the arcs are cut into for the tests of what is inside what (that one is smaller by the slivers between chord and arc: a tenth of a percent)
  const exactArea = (list: number[]): number => {
    let a = 0;
    for (const h of list) {
      const hf = halves[h]!, pc = ps[hf.piece]!, s = segs[pc.seg]!, P = vx[hf.from]!, Q = vx[hf.to]!;
      if (s.kind === "line") a += (P[0] * Q[1] - Q[0] * P[1]) / 2;
      else { const dt = (hf.fwd ? 1 : -1) * (pc.p1 - pc.p0); a += (s.r * s.r * dt + s.c[0] * (Q[1] - P[1]) - s.c[1] * (Q[0] - P[0])) / 2; }
    }
    return a;
  };
  const poly_ = cycles.map(pts), area = cycles.map(exactArea);
  // connected components (by shared vertices)
  const comp = vx.map((_, i) => i), find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i]!)));
  for (const p of ps) comp[find(p.v0)] = find(p.v1);
  const compOf = (c: number) => find(halves[cycles[c]![0]!]!.from);
  // the faces: positive cycles; a component's outer boundary (a negative cycle) is a hole of the smallest face of another component that holds it
  const faceCycles = cycles.map((_, i) => i).filter((i) => area[i]! > 1e-12 * ext * ext);
  const holeOf = new Map<number, number>(); // negative cycle -> the face (a cycle) that holds it, or absent
  const holes = new Map<number, number[]>();
  cycles.forEach((_, i) => {
    if (area[i]! > -1e-12 * ext * ext) return;
    const probe = poly_[i]![0]!; let best = -1;
    for (const f of faceCycles) if (compOf(f) !== compOf(i) && inside(poly_[f]!, probe) && (best < 0 || area[f]! < area[best]!)) best = f;
    if (best >= 0) { holeOf.set(i, best); holes.set(best, [...(holes.get(best) ?? []), i]); }
  });
  const leftFace = (h: number): number => { const c = cyc[h]!; return area[c]! > 0 ? c : (holeOf.get(c) ?? -1); }; // -1: outside everything
  // the sample point of a face, the left of the middle of its first edge; the parity of the crossings of a slanted ray with every piece
  const crossings = (p: Pt): number => { let n = 0; const ray = 0.7137; for (const pc of ps) { const q = poly(pc); for (let i = 0; i + 1 < q.length; i++) { const a = q[i]!, b = q[i + 1]!, sa = (a[1] - p[1]) - ray * (a[0] - p[0]), sb = (b[1] - p[1]) - ray * (b[0] - p[0]); if ((sa > 0) !== (sb > 0)) { const t = sa / (sa - sb), x = a[0] + (b[0] - a[0]) * t; if (x > p[0]) n++; } } } return n; };
  const sampleOf = (f: number): Pt => { const h = cycles[f]![0]!, q = poly(ps[halves[h]!.piece]!, halves[h]!.fwd), a = q[0]!, b = q[1]!, m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = hyp(b[0] - a[0], b[1] - a[1]) || 1, d = 1e-6 * ext; return [m[0] - ((b[1] - a[1]) / L) * d, m[1] + ((b[0] - a[0]) / L) * d]; };
  const faceOfPoint = (p: Pt): number => { let best = -1; for (const f of faceCycles) if (inside(poly_[f]!, p) && !(holes.get(f) ?? []).some((hc) => inside(poly_[hc]!, p)) && (best < 0 || area[f]! < area[best]!)) best = f; return best; };
  const filled = new Map<number, boolean>();
  if (opts.pick?.length) { for (const f of faceCycles) filled.set(f, false); for (const p of opts.pick) { const f = faceOfPoint(p); if (f >= 0) filled.set(f, true); } }
  else for (const f of faceCycles) filled.set(f, crossings(sampleOf(f)) % 2 === 1);
  const fill = (f: number) => f >= 0 && filled.get(f) === true;
  const faces: Faces[] = faceCycles.map((f) => ({ sample: sampleOf(f), area: area[f]! + (holes.get(f) ?? []).reduce((s, hc) => s + area[hc]!, 0) /* an island inside it is not part of it (its cycle runs clockwise: negative) */, filled: fill(f) }));
  // the boundary: half-edges with a filled face on the left and not on the right; traced into loops
  const edge = (h: number) => fill(leftFace(h)) && !fill(leftFace(twin(h)));
  const seen = new Set<number>(), loops: { halves: number[] }[] = [];
  for (let h = 0; h < halves.length; h++) {
    if (!edge(h) || seen.has(h)) continue;
    const list: number[] = []; let g = h; do { seen.add(g); list.push(g); g = next(g, edge); } while (g !== h && !seen.has(g) && list.length <= halves.length);
    loops.push({ halves: list });
  }
  // the loops as sides: neighbours on the same part, one after another, are one side
  const sidesOf = (list: number[]): Piece[] => {
    type Run = { seg: number; fwd: boolean; p0: number; p1: number; v0: number; v1: number };
    const runs: Run[] = [];
    for (const h of list) { const H = halves[h]!, P = ps[H.piece]!, a = H.fwd ? P.p0 : P.p1, b = H.fwd ? P.p1 : P.p0, r = runs[runs.length - 1]; if (r && r.seg === P.seg && r.fwd === H.fwd && r.v1 === H.from && Math.abs(r.p1 - a) < 1e-12) { r.p1 = b; r.v1 = H.to; } else runs.push({ seg: P.seg, fwd: H.fwd, p0: a, p1: b, v0: H.from, v1: H.to }); }
    const f = runs[0], l = runs[runs.length - 1];
    if (runs.length > 1 && f!.seg === l!.seg && f!.fwd === l!.fwd && l!.v1 === f!.v0) { const gap = norm(f!.p0 - l!.p1); if (gap < 1e-12 || gap > TAU - 1e-12) { l!.p1 = f!.p1 + (closed(segs[f!.seg]!) ? (f!.fwd ? TAU : -TAU) : 0); l!.v1 = f!.v1; runs.shift(); } }
    return runs.map((r) => { const s = segs[r.seg]!, a = vx[r.v0]!, b = vx[r.v1]!, base = { name: s.name, k: 0, of: 1, a, b }; return s.kind === "line" ? base : { ...base, mid: pointAt(s, (r.p0 + r.p1) / 2), arc: { c: s.c, r: s.r } }; });
  };
  const built = loops.map((l) => ({ pieces: sidesOf(l.halves), poly: pts(l.halves) })).map((l) => ({ ...l, area: areaOf(l.poly) }));
  // a part that reaches the boundary in several sides numbers them, in the order they are met
  const count = new Map<string, number>(); for (const l of built) for (const p of l.pieces) count.set(p.name, (count.get(p.name) ?? 0) + 1);
  const used = new Map<string, number>(); for (const l of built) for (const p of l.pieces) { p.of = count.get(p.name)!; p.k = used.get(p.name) ?? 0; used.set(p.name, p.k + 1); }
  const whole = (l: { pieces: Piece[] }) => { const p = l.pieces[0]; if (l.pieces.length === 1 && p?.arc && dist2(p.a, p.b) < eps * 10) return { name: p.name, c: p.arc.c, r: p.arc.r }; return undefined; };
  const done: Loop[] = built.map((l) => { const w = whole(l); return { pieces: l.pieces, ...(w ? { whole: w } : {}), area: l.area }; });
  const outlines = built.map((l, i) => ({ l, i })).filter(({ l }) => l.area > 0), holeLoops = built.map((l, i) => ({ l, i })).filter(({ l }) => l.area < 0);
  const profiles: Profile[] = outlines.map(({ i }) => ({ outer: done[i]!, holes: [] }));
  for (const { l, i } of holeLoops) { let best = -1; for (let k = 0; k < outlines.length; k++) { const o = outlines[k]!; if (inside(o.l.poly, l.poly[0]!) && (best < 0 || o.l.area < outlines[best]!.l.area)) best = k; } if (best >= 0) profiles[best]!.holes.push(done[i]!); }
  return { profiles, faces };
}
