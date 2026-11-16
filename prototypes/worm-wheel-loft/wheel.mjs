// Prototype (thrown away, `in_572`): a throated worm wheel as a loft through sections worked out from the worm, and how well it fits the worm.
// Run (from app/): K=5 node ../prototypes/worm-wheel-loft/wheel.mjs
//
// The wheel is what the worm leaves of a blank. A point of the wheel is cut when, at some turn of the worm, it is inside the worm's solid; so the boundary of the wheel at a height h and a wheel angle psi is the smallest radius
// at which the point is inside the worm, over all turns phi (the worm turns phi about its own axis and the wheel phi / z about its): exact for the worm as drawn, found by scanning, no solid booleans.
import { makeCylinder, makePolygon, genericSweep, makeAx3, getOC, Wire, measureVolume, makeThreePointArc, makeLine, assembleWire, loft } from "../../app/node_modules/replicad/dist/replicad.js";
import { init } from "../../app/src/compiler/kernel/occt/evaluate.mjs";
await init();
const K = Number(process.env.K ?? 5), SKIP_INT = !!process.env.NOINT;
const m = 2, z = 20, rp = 12, W = 12, alpha = (20 * Math.PI) / 180, lead = Math.PI * m, tanA = Math.tan(alpha);
const rRoot = rp - 1.25 * m, rTip = rp + m, rw = (m * z) / 2, cd = rw + rp, P = (2 * Math.PI) / z;
const Rt = rRoot + 0.5; // (the wheel's tip surface is an arc about the worm's axis, this far from it: the throat)
const rBlank = (h) => cd - Math.sqrt(Rt * Rt - h * h);
const half = (r) => (Math.PI * m) / 4 - (r - rp) * tanA;
const [hTip, hRoot] = [half(rTip), half(rRoot)];
const rhoS = (u) => { const a = Math.abs(u); return a <= hTip ? rTip : a >= hRoot ? rRoot : rp + ((Math.PI * m) / 4 - a) / tanA; };
const inside = (x, y, h, phi) => { const dy = y + cd, rho = Math.hypot(dy, h), th = Math.atan2(dy, -h); let u = x - (lead * (th - phi)) / (2 * Math.PI); u -= lead * Math.round(u / lead); return rho <= rhoS(u); };
const PHIS = Array.from({ length: 1067 }, (_, i) => -16 + 0.03 * i); // (the worm's turns: a point of the wheel is within reach of the worm for some 24 radians of them)
const wrapPsi = (psi, a) => a + (((psi - a) % P) + P) % P; // (into the window [a, a + P))
const PSI_A = -Math.PI / 2 - 1.5 * P;
/** whether the worm cuts the point (X, Y, h) of the wheel (wheel frame) at some turn of it, or the point is outside the blank: then it is not the wheel's material */
function material(X0, Y0, h) {
  if (Math.hypot(X0, Y0) > rBlank(h) + 1e-12) return false;
  // the wheel repeats every pitch: the point is brought into the pitch that faces the worm
  const r0 = Math.hypot(X0, Y0), a0 = Math.atan2(Y0, X0), a1 = -Math.PI / 2 - P / 2 + ((((a0 + Math.PI / 2 + P / 2) % P) + P) % P);
  const [X, Y] = [r0 * Math.cos(a1), r0 * Math.sin(a1)];
  for (const phi of PHIS) { const th = -phi / z, c = Math.cos(th), s = Math.sin(th); if (inside(X * c - Y * s, X * s + Y * c, h, phi)) return false; }
  return true;
}
const T = (label, f) => { const t = performance.now(); const r = f(); console.log(`${label}: ${Math.round(performance.now() - t)} ms`); return r; };

/**
 * One section at height h: the gap between two teeth as a curve, found by marching squares on the material test over a window of two pitches in (angle, radius), each crossing of a grid edge put exactly by bisection, so a flank
 * that is nearly radial is no trouble. The gap is then cut into NGAP pieces of equal length, each an arc through its two ends and its middle; the tooth's top is one arc about the middle.
 */
const NGAP = 18, DPSI = 0.003, DR = 0.04, R_LO = 16;
let lastStart = null;
function section(h) {
  const top = rBlank(h), psi0 = PSI_A - 0.2, nPsi = Math.round((2 * P + 0.4) / DPSI), nR = Math.round((top - R_LO) / DR);
  const dr = (top - R_LO) / nR;
  const node = (i, j) => [psi0 + i * DPSI, R_LO + j * dr];
  const xy = ([ps, r]) => [r * Math.cos(ps), r * Math.sin(ps)];
  const mat = Array.from({ length: nPsi + 1 }, (_, i) => Array.from({ length: nR + 1 }, (_, j) => { const [X, Y] = xy(node(i, j)); return material(X, Y, h); }));
  const crossing = new Map();
  const cross = (i0, j0, i1, j1) => { // (the point on the grid edge from node 0 to node 1 where the material ends)
    const key = `${i0},${j0},${i1},${j1}`;
    if (crossing.has(key)) return crossing.get(key);
    let [lo, hi, m0] = [0, 1, mat[i0][j0]];
    for (let q = 0; q < 26; q++) { const t = (lo + hi) / 2; const [a, b] = [node(i0, j0), node(i1, j1)]; const [X, Y] = xy([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); if (material(X, Y, h) === m0) lo = t; else hi = t; }
    const t = (lo + hi) / 2, [a, b] = [node(i0, j0), node(i1, j1)];
    const pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    crossing.set(key, pt);
    return pt;
  };
  const segs = []; // pairs of edge keys with their points
  for (let i = 0; i < nPsi; i++) for (let j = 0; j < nR; j++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], v = c.map(([a, b]) => mat[a][b]);
    const edges = [];
    for (let e = 0; e < 4; e++) { const [p, q] = [c[e], c[(e + 1) % 4]]; if (v[e] !== v[(e + 1) % 4]) { const [lo, hi] = p[0] < q[0] || p[1] < q[1] ? [p, q] : [q, p]; edges.push({ key: `${lo}|${hi}`, pt: () => cross(lo[0], lo[1], hi[0], hi[1]) }); } }
    for (let e = 0; e + 1 < edges.length; e += 2) segs.push([edges[e], edges[e + 1]]);
  }
  // chains of segments
  const byKey = new Map();
  for (const sg of segs) for (const e of sg) { if (!byKey.has(e.key)) byKey.set(e.key, []); byKey.get(e.key).push(sg); }
  const used = new Set(), chains = [];
  for (const sg of segs) {
    if (used.has(sg)) continue;
    used.add(sg);
    const chain = [sg[0], sg[1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const end = dir ? chain[chain.length - 1] : chain[0];
        const next = (byKey.get(end.key) ?? []).find((o) => !used.has(o));
        if (!next) break;
        used.add(next);
        const other = next[0].key === end.key ? next[1] : next[0];
        if (dir) chain.push(other); else chain.unshift(other);
      }
    }
    chains.push(chain.map((e) => e.pt()));
  }
  // the gaps: chains that start and end on the top row, wholly inside the window
  const onTop = (pt) => Math.abs(pt[1] - top) < dr * 0.51;
  const full = chains.filter((c) => c.length > 8 && onTop(c[0]) && onTop(c[c.length - 1]) && c.every((q) => q[0] > psi0 + 3 * DPSI && q[0] < psi0 + nPsi * DPSI - 3 * DPSI)).map((c) => (c[0][0] > c[c.length - 1][0] ? c.slice().reverse() : c));
  if (!full.length) throw new Error(`no whole gap at height ${h} (${chains.length} chains)`);
  full.sort((p, q) => (lastStart === null ? p[0][0] - q[0][0] : Math.abs(p[0][0] - lastStart) - Math.abs(q[0][0] - lastStart)));
  const gap = full[0].map(xy);
  const gp = full[0];
  lastStart = gp[0][0];
  const cum = [0]; for (let q = 1; q < gap.length; q++) cum.push(cum[q - 1] + Math.hypot(gap[q][0] - gap[q - 1][0], gap[q][1] - gap[q - 1][1]));
  const at = (sv) => { let q = 1; while (q < gap.length - 1 && cum[q] < sv) q++; const f = (sv - cum[q - 1]) / (cum[q] - cum[q - 1] || 1); return [gap[q - 1][0] + f * (gap[q][0] - gap[q - 1][0]), gap[q - 1][1] + f * (gap[q][1] - gap[q - 1][1])]; };
  const L = cum[cum.length - 1];
  const gapArcs = Array.from({ length: NGAP }, (_, i) => [at((L * i) / NGAP), at((L * (i + 0.5)) / NGAP), at((L * (i + 1)) / NGAP)]);
  const start = gap[0], end = gap[gap.length - 1];
  const psA = Math.atan2(end[1], end[0]), psB = Math.atan2(start[1], start[0]) + P; // (the top of the tooth: from the end of this gap to the start of the next)
  let pe = psA; while (psB < pe) pe -= 2 * Math.PI;
  const mid = (psA + psB) / 2;
  const topArc = [end, [top * Math.cos(mid), top * Math.sin(mid)], [Math.cos(P) * start[0] - Math.sin(P) * start[1], Math.sin(P) * start[0] + Math.cos(P) * start[1]]];
  return { h, top, arcs: [...gapArcs, topArc], gapStartPsi: gp[0][0], gapEndPsi: gp[gp.length - 1][0], plateau: (psB - psA) / P };
}
function wireOf(sec) {
  const edges = [];
  for (let k = 0; k < z; k++) { const [c, s] = [Math.cos(k * P), Math.sin(k * P)]; const rot = ([x, y]) => [x * c - y * s, x * s + y * c, sec.h]; for (const [a, b, d] of sec.arcs) { const [p, q, r] = [rot(a), rot(b), rot(d)]; const area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const len = Math.hypot(r[0] - p[0], r[1] - p[1]); edges.push(Math.abs(area) < 1e-7 * len * len ? makeLine(p, r) : makeThreePointArc(p, q, r)); } }
  return assembleWire(edges);
}

// ---- the worm, as in the hobbing benchmark, along X at y = -cd ----
function helix(pitch, height, radius, centre, dir, xDir) {
  const oc = getOC(), turns = height / pitch;
  const line = new oc.Geom2d_Line(new oc.gp_Pnt2d(0, 0), new oc.gp_Dir2d(2 * Math.PI, pitch));
  const seg = new oc.GC_MakeSegment2d(line.Value(0), line.Value(turns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2)));
  const surface = new oc.Geom_CylindricalSurface(makeAx3(centre, dir, xDir), radius);
  const wire = new oc.BRepBuilderAPI_MakeWire(new oc.BRepBuilderAPI_MakeEdge(seg.Value(), surface).Edge()).Wire();
  oc.BRepLib.BuildCurves3d(wire);
  return new Wire(wire);
}
const a0 = -2 * lead, len = 30;
const profile = makePolygon([[rRoot - 0.5, 0, a0 - half(rRoot - 0.5)], [rTip, 0, a0 - half(rTip)], [rTip, 0, a0 + half(rTip)], [rRoot - 0.5, 0, a0 + half(rRoot - 0.5)]]).outerWire();
const wormBuild = () => makeCylinder(rRoot, len + 2 * lead, [0, 0, a0 - lead], [0, 0, 1]).fuse(genericSweep(profile, helix(lead, len, rTip, [0, 0, a0], [0, 0, 1], [1, 0, 0]), { frenet: true }));
const wormAt = (worm, phiDeg) => worm.clone().rotate(phiDeg, [0, 0, 0], [0, 0, 1]).rotate(90, [0, 0, 0], [0, 1, 0]).translate([0, -cd, 0]);

// ---- the wheel ----
const heights = Array.from({ length: K }, (_, k) => -W / 2 + (W * k) / (K - 1));
const secs = T(`${K} sections (worked out from the worm)`, () => heights.map((h) => section(h)));
secs.forEach((s) => console.log(`  h ${s.h.toFixed(2)}: tip radius ${s.top.toFixed(3)}, top of the tooth ${(s.plateau * 100).toFixed(0)} per cent of the pitch, the gap from ${s.gapStartPsi.toFixed(4)} to ${s.gapEndPsi.toFixed(4)} rad`));
const wheel = T(`the loft through ${K} sections`, () => loft(secs.map(wireOf), { ruled: false }));
const vW = measureVolume(wheel);
console.log(`wheel volume ${vW.toFixed(1)}`);

// accuracy: from each vertex of the loft's mesh, along its normal, to where the exact material ends (positive: the loft is outside it, in the worm's way)
const mesh = T("the loft meshed", () => wheel.mesh({ tolerance: 0.02, angularTolerance: 0.15 }));
const devs = [];
const nv = mesh.vertices.length / 3, stepv = Math.max(1, Math.floor(nv / 300));
for (let q = 0; q < nv; q += stepv) {
  const [x, y, h] = [mesh.vertices[3 * q], mesh.vertices[3 * q + 1], mesh.vertices[3 * q + 2]];
  const [nx, ny, nz] = [mesh.normals[3 * q], mesh.normals[3 * q + 1], mesh.normals[3 * q + 2]];
  if (Math.abs(nz) > 0.9 || Math.abs(h) > W / 2 - 1e-6) continue; // (the flat ends are the sections themselves)
  const at = (t) => material(x + nx * t, y + ny * t, h + nz * t);
  const startIn = at(0); // (material here: the surface is outside the exact one or on it; go outward to find where the material ends)
  let t0 = 0, t1 = startIn ? 3 : -3, hit = false;
  if (startIn) { for (let t = 0; t <= 3; t += 0.1) if (!at(t)) { t1 = t; hit = true; break; } } else { for (let t = 0; t >= -3; t -= 0.1) if (at(t)) { t1 = t; hit = true; break; } }
  if (!hit) continue;
  let [lo, hi] = startIn ? [t1 - 0.1, t1] : [t1, t1 + 0.1];
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (at(mid)) lo = mid; else hi = mid; }
  const dist = (lo + hi) / 2; // (outward distance from the vertex to the exact surface: negative when the loft is outside it)
  const nr = (x * nx + y * ny) / Math.hypot(x, y);
  devs.push({ d: -dist, near: Math.min(...heights.map((qh) => Math.abs(qh - h))), x, y, h, nr, startIn });
}
const stats = (xs) => xs.length ? { n: xs.length, outside: Math.max(0, ...xs).toFixed(3), inside: Math.max(0, ...xs.map((v) => -v)).toFixed(3), meanAbs: (xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length).toFixed(3) } : { n: 0 };
const by = (lo, hi) => stats(devs.filter((v) => v.near >= lo && v.near < hi).map((v) => v.d));
console.log("the loft surface against the exact surface, mm along the normal (outside = in the worm's way, inside = thinner than it should be):");
console.log("  all", JSON.stringify(stats(devs.map((v) => v.d))));
console.log("  on a section (within 0.05 mm of one)", JSON.stringify(by(0, 0.05)));
console.log("  between sections (0.3 mm or more)", JSON.stringify(by(0.3, 99)));
console.log("  flanks (normal mostly sideways)", JSON.stringify(stats(devs.filter((v) => Math.abs(v.nr) < 0.7).map((v) => v.d))), " tips and roots (normal mostly radial)", JSON.stringify(stats(devs.filter((v) => Math.abs(v.nr) >= 0.7).map((v) => v.d))));
for (const v of devs.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6)) console.log(`  worst: d ${v.d.toFixed(3)} at (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, h ${v.h.toFixed(2)}) r ${Math.hypot(v.x, v.y).toFixed(2)} radial normal ${v.nr.toFixed(2)} material at the vertex ${v.startIn}`);

if (!SKIP_INT) {
  const worm = T("the worm", wormBuild);
  console.log(`worm volume ${measureVolume(worm).toFixed(1)}`);
  for (const phi of [0, 90, 180, 270]) {
    const t = performance.now();
    let over;
    try { over = measureVolume(wheel.clone().rotate(-phi / z, [0, 0, 0], [0, 0, 1]).intersect(wormAt(worm, phi))); } catch (e) { over = `failed: ${e?.message ?? e}`; }
    console.log(`turn ${phi} degrees: wheel and worm overlap ${typeof over === "number" ? over.toFixed(3) + " mm3" : over} (${Math.round(performance.now() - t)} ms)`);
  }
}
