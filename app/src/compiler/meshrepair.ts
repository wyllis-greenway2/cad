// Making a mesh fit to import (`dec_exchange_gaps`): small holes in its surface filled, and a mesh of more triangles than the app builds into a solid reduced (quadric edge collapse, the method of Garland and Heckbert) to the number it does. Pure numbers in, numbers out.
import type { Mesh } from "./meshfile.ts";

const key = (a: number, b: number, n: number): number => Math.min(a, b) * n + Math.max(a, b);

// ---------- holes ----------
/** Fill the holes of a mesh (loops of edges that belong to one triangle each) of at most `maxEdges` edges, by triangles that run the way the neighbours need (the corners of a loop cut into triangles as ears, flat as the loop is). Loops that are bigger, or not simple, stay: the import then says the mesh is open. */
export function fillHoles(mesh: Mesh, maxEdges = 64): { mesh: Mesh; filled: number; left: number } {
  const { vertices: v, triangles: t } = mesh;
  const nt = t.length / 3, nv = v.length / 3;
  const count = new Map<number, number>();
  for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) { const e = key(t[3 * i + k]!, t[3 * i + (k + 1) % 3]!, nv); count.set(e, (count.get(e) ?? 0) + 1); }
  // the boundary edges, each in the direction its triangle runs; a fill triangle runs the edge the other way
  const next = new Map<number, number[]>(); // from -> [to…] of the fill direction (b to a)
  let any = false;
  for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) {
    const [a, b] = [t[3 * i + k]!, t[3 * i + (k + 1) % 3]!];
    if (count.get(key(a, b, nv)) === 1) { (next.get(b) ?? next.set(b, []).get(b)!).push(a); any = true; }
  }
  if (!any) return { mesh, filled: 0, left: 0 };
  const used = new Set<number>();
  const add: number[] = [];
  let filled = 0, left = 0;
  for (const start of [...next.keys()]) {
    for (const first of next.get(start)!) {
      if (used.has(start * nv + first)) continue;
      const loop = [start];
      let [from, to] = [start, first];
      let simple = true;
      while (simple) {
        used.add(from * nv + to);
        if (to === start) break;
        if (loop.includes(to)) { simple = false; break; } // (the walk goes on round a big loop to the end, so that all its edges are counted once)
        loop.push(to);
        const outs = next.get(to);
        if (!outs || outs.length !== 1) { simple = false; break; }
        [from, to] = [to, outs[0]!];
      }
      const tris = simple && loop.length >= 3 && loop.length <= maxEdges ? earClip(loop, v) : null;
      if (tris) { add.push(...tris); filled++; } else left++;
    }
  }
  if (!filled) return { mesh, filled: 0, left };
  const out = new Uint32Array(t.length + add.length);
  out.set(t); out.set(add, t.length);
  return { mesh: { vertices: v, triangles: out }, filled, left };
}

/** The triangles (corner numbers, in the loop's direction) of a polygon of 3D points, by ear clipping in the plane of its Newell normal; null when it cannot be done. */
function earClip(loop: number[], v: Float32Array): number[] | null {
  const P = (i: number): [number, number, number] => [v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!];
  let [nx, ny, nz] = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const [a, b] = [P(loop[i]!), P(loop[(i + 1) % loop.length]!)];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  const n: [number, number, number] = [nx / len, ny / len, nz / len];
  const u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(n, u)), e2 = cross(n, e1);
  const q = loop.map((i) => { const p = P(i); return [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]] as [number, number]; });
  const idx = loop.map((_, i) => i);
  const out: number[] = [];
  const area2 = (a: [number, number], b: [number, number], c: [number, number]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const [ia, ib, ic] = [idx[(k + idx.length - 1) % idx.length]!, idx[k]!, idx[(k + 1) % idx.length]!];
      if (area2(q[ia]!, q[ib]!, q[ic]!) <= 1e-12) continue; // (a reflex or flat corner is not an ear)
      let inside = false;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (area2(q[ia]!, q[ib]!, q[j]!) >= 0 && area2(q[ib]!, q[ic]!, q[j]!) >= 0 && area2(q[ic]!, q[ia]!, q[j]!) >= 0) { inside = true; break; } }
      if (inside) continue;
      out.push(loop[ia]!, loop[ib]!, loop[ic]!);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  if (idx.length === 3) {
    if (area2(q[idx[0]!]!, q[idx[1]!]!, q[idx[2]!]!) <= 1e-12) return null;
    out.push(loop[idx[0]!]!, loop[idx[1]!]!, loop[idx[2]!]!);
  }
  return out;
}
const cross = (a: number[], b: number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: number[]): [number, number, number] => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };

// ---------- reduce ----------
/** The volume a closed mesh holds (positive when it runs outward). */
export function meshVolume(mesh: Mesh): number {
  const { vertices: v, triangles: t } = mesh;
  let vol = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i]! * 3, t[i + 1]! * 3, t[i + 2]! * 3];
    vol += v[a]! * (v[b + 1]! * v[c + 2]! - v[b + 2]! * v[c + 1]!) - v[a + 1]! * (v[b]! * v[c + 2]! - v[b + 2]! * v[c]!) + v[a + 2]! * (v[b]! * v[c + 1]! - v[b + 1]! * v[c]!);
  }
  return vol / 6;
}

/**
 * A closed, consistently turned mesh reduced to about `target` triangles by collapsing the edge that moves the surface least (each corner keeps the sum of the squared distances to the planes of its triangles: a flat area costs nothing, so it is reduced first and a curved area last). A collapse that would pinch the surface (the two ends share a neighbour other than the two opposite corners) or turn a triangle over is not done. Returns the mesh as it is when it cannot reach the target.
 */
export function decimate(mesh: Mesh, target: number): Mesh {
  const nt0 = mesh.triangles.length / 3;
  if (nt0 <= target || target < 4) return mesh;
  const nv = mesh.vertices.length / 3;
  const pos = Float64Array.from(mesh.vertices);
  const tv = Int32Array.from(mesh.triangles);
  const alive = new Uint8Array(nt0).fill(1);
  const star: Set<number>[] = Array.from({ length: nv }, () => new Set<number>()); // the triangles at each corner
  for (let i = 0; i < nt0; i++) for (let k = 0; k < 3; k++) star[tv[3 * i + k]!]!.add(i);
  const Q = new Float64Array(nv * 10); // a symmetric 4 by 4: a b c d, e f g, h i, j  (the plane quadric's upper triangle)
  const planeQ = (i: number): number[] | null => {
    const [a, b, c] = [tv[3 * i]! * 3, tv[3 * i + 1]! * 3, tv[3 * i + 2]! * 3];
    const [ux, uy, uz] = [pos[b]! - pos[a]!, pos[b + 1]! - pos[a + 1]!, pos[b + 2]! - pos[a + 2]!];
    const [wx, wy, wz] = [pos[c]! - pos[a]!, pos[c + 1]! - pos[a + 1]!, pos[c + 2]! - pos[a + 2]!];
    let [nx, ny, nz] = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-15) return null;
    const area = len / 2;
    [nx, ny, nz] = [nx / len, ny / len, nz / len];
    const d = -(nx * pos[a]! + ny * pos[a + 1]! + nz * pos[a + 2]!);
    return [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d].map((x) => x * area);
  };
  for (let i = 0; i < nt0; i++) { const q = planeQ(i); if (!q) continue; for (let k = 0; k < 3; k++) { const o = tv[3 * i + k]! * 10; for (let m = 0; m < 10; m++) Q[o + m]! += q[m]!; } }
  const version = new Int32Array(nv);
  const gone = new Uint8Array(nv);
  // the best place for the corner that two collapse into, and what it costs
  const best = (u: number, w: number): { cost: number; p: [number, number, number] } => {
    const q = new Float64Array(10);
    for (let m = 0; m < 10; m++) q[m] = Q[u * 10 + m]! + Q[w * 10 + m]!;
    const err = (x: number, y: number, z: number): number => q[0]! * x * x + 2 * q[1]! * x * y + 2 * q[2]! * x * z + 2 * q[3]! * x + q[4]! * y * y + 2 * q[5]! * y * z + 2 * q[6]! * y + q[7]! * z * z + 2 * q[8]! * z + q[9]!;
    const pu: [number, number, number] = [pos[3 * u]!, pos[3 * u + 1]!, pos[3 * u + 2]!], pw: [number, number, number] = [pos[3 * w]!, pos[3 * w + 1]!, pos[3 * w + 2]!];
    const cands: [number, number, number][] = [pu, pw, [(pu[0] + pw[0]) / 2, (pu[1] + pw[1]) / 2, (pu[2] + pw[2]) / 2]];
    const det = q[0]! * (q[4]! * q[7]! - q[5]! * q[5]!) - q[1]! * (q[1]! * q[7]! - q[5]! * q[2]!) + q[2]! * (q[1]! * q[5]! - q[4]! * q[2]!);
    if (Math.abs(det) > 1e-12) { // (the point that costs least, when the three planes meet in one)
      const [b0, b1, b2] = [-q[3]!, -q[6]!, -q[8]!];
      const x = (b0 * (q[4]! * q[7]! - q[5]! * q[5]!) - q[1]! * (b1 * q[7]! - q[5]! * b2) + q[2]! * (b1 * q[5]! - q[4]! * b2)) / det;
      const y = (q[0]! * (b1 * q[7]! - q[5]! * b2) - b0 * (q[1]! * q[7]! - q[5]! * q[2]!) + q[2]! * (q[1]! * b2 - b1 * q[2]!)) / det;
      const z = (q[0]! * (q[4]! * b2 - b1 * q[5]!) - q[1]! * (q[1]! * b2 - b1 * q[2]!) + b0 * (q[1]! * q[5]! - q[4]! * q[2]!)) / det;
      const span = Math.hypot(pu[0] - pw[0], pu[1] - pw[1], pu[2] - pw[2]);
      if (Number.isFinite(x + y + z) && Math.hypot(x - cands[2]![0], y - cands[2]![1], z - cands[2]![2]) < 3 * span + 1e-9) cands.push([x, y, z]); // (not far from the edge: a far point is a sliver's artefact)
    }
    let [bp, bc] = [cands[0]!, Infinity];
    for (const c of cands) { const e = err(c[0], c[1], c[2]); if (e < bc) { bc = e; bp = c; } }
    return { cost: Math.max(0, bc), p: bp };
  };
  type Entry = { cost: number; u: number; w: number; vu: number; vw: number };
  const heap: Entry[] = [];
  const push = (e: Entry): void => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p]!.cost <= heap[i]!.cost) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; } };
  const pop = (): Entry | undefined => {
    const top = heap[0]; const last = heap.pop();
    if (top && last && heap.length) { heap[0] = last; let i = 0; for (;;) { const [l, r] = [2 * i + 1, 2 * i + 2]; let m = i; if (l < heap.length && heap[l]!.cost < heap[m]!.cost) m = l; if (r < heap.length && heap[r]!.cost < heap[m]!.cost) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m; } }
    return top;
  };
  const neighbours = (u: number): Set<number> => { const out = new Set<number>(); for (const i of star[u]!) for (let k = 0; k < 3; k++) { const x = tv[3 * i + k]!; if (x !== u) out.add(x); } return out; };
  const queueEdge = (u: number, w: number): void => { const { cost } = best(u, w); push({ cost: cost + 1e-9 * (star[u]!.size + star[w]!.size), u, w, vu: version[u]!, vw: version[w]! }); }; // (a tiny extra for a corner with many triangles: on a flat area, where every collapse costs nothing, the corners are reduced evenly and none grows a huge fan that makes every later step slow)
  const seen = new Set<number>();
  for (let i = 0; i < nt0; i++) for (let k = 0; k < 3; k++) { const [a, b] = [tv[3 * i + k]!, tv[3 * i + (k + 1) % 3]!]; const e = key(a, b, nv); if (!seen.has(e)) { seen.add(e); queueEdge(Math.min(a, b), Math.max(a, b)); } }
  let live = nt0;
  const normalOf = (i: number, move?: { from: number; to: number; p: [number, number, number] }): [number, number, number] | null => {
    const P = (c: number): [number, number, number] => (move && (c === move.from || c === move.to) ? move.p : [pos[3 * c]!, pos[3 * c + 1]!, pos[3 * c + 2]!]);
    const [a, b, c] = [P(tv[3 * i]!), P(tv[3 * i + 1]!), P(tv[3 * i + 2]!)];
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const l = Math.hypot(n[0], n[1], n[2]);
    return l < 1e-15 ? null : [n[0] / l, n[1] / l, n[2] / l];
  };
  while (live > target) {
    const e = pop();
    if (!e) break;
    const { u, w } = e;
    if (gone[u] || gone[w] || e.vu !== version[u] || e.vw !== version[w]) continue; // (stale)
    // the triangles on the edge, and the corners opposite
    const shared = [...star[u]!].filter((i) => star[w]!.has(i));
    if (shared.length !== 2) continue;
    const opposite = new Set<number>();
    for (const i of shared) for (let k = 0; k < 3; k++) { const x = tv[3 * i + k]!; if (x !== u && x !== w) opposite.add(x); }
    const [nu, nw] = [neighbours(u), neighbours(w)];
    let common = 0;
    for (const x of nu) if (nw.has(x)) common++;
    if (common !== 2 || opposite.size !== 2) continue; // (it would pinch the surface)
    const { p } = best(u, w);
    let ok = true;
    for (const [from, other] of [[u, w], [w, u]] as const) {
      for (const i of star[from]!) {
        if (shared.includes(i)) continue;
        const before = normalOf(i);
        const after = normalOf(i, { from: u, to: w, p });
        if (!after || (before && before[0] * after[0] + before[1] * after[1] + before[2] * after[2] < 0.3)) { ok = false; break; }
      }
      void other;
      if (!ok) break;
    }
    if (!ok) continue;
    // collapse w into u
    for (const i of shared) { alive[i] = 0; live--; for (let k = 0; k < 3; k++) star[tv[3 * i + k]!]!.delete(i); }
    for (const i of star[w]!) { for (let k = 0; k < 3; k++) if (tv[3 * i + k] === w) tv[3 * i + k] = u; star[u]!.add(i); }
    star[w]!.clear();
    gone[w] = 1;
    pos[3 * u] = p[0]; pos[3 * u + 1] = p[1]; pos[3 * u + 2] = p[2];
    for (let m = 0; m < 10; m++) Q[u * 10 + m]! += Q[w * 10 + m]!;
    version[u]!++;
    for (const x of neighbours(u)) queueEdge(Math.min(u, x), Math.max(u, x));
  }
  // what is left, with its corners numbered again
  const map = new Int32Array(nv).fill(-1);
  const vs: number[] = [], ts: number[] = [];
  for (let i = 0; i < nt0; i++) {
    if (!alive[i]) continue;
    for (let k = 0; k < 3; k++) { const c = tv[3 * i + k]!; if (map[c]! < 0) { map[c] = vs.length / 3; vs.push(pos[3 * c]!, pos[3 * c + 1]!, pos[3 * c + 2]!); } ts.push(map[c]!); }
  }
  return { vertices: Float32Array.from(vs), triangles: Uint32Array.from(ts) };
}
