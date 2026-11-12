// Pulling or pushing a face the body already has (`in_171`, `in_173`, `q_face_edit_model`): instead of adding a prism at that face (which invents new faces where the neighbours do not follow),
// change the step that made the face, so the steps after it are worked out again and nothing new is made: the end of an extrusion changes the extrusion's depth; the wall of an extruded
// circle (a post, or the wall of a hole) changes that circle's radius, so a chamfer on its rim goes with it. Where the step that made the face cannot be told, the old way (a prism) is used.
import { TAU } from "../operation/regions.ts";
import type { Ref } from "../shared/ref.ts";
import { dot, sub, scale, cross, normalize } from "../math/vec.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { figureRefs } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { solveScene } from "../compiler/solve.ts";
import { nextId } from "../operation/scene.ts";
import { applyPoint, inverse, laterMotion } from "../operation/frames.ts";
import type { Plane, Curved, Part } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";

/** What a face is the result of, and what to change to move it. */
export type FaceEdit =
  | { kind: "depth"; step: string; depth: number; /** +1 when pulling the face out lengthens the extrusion */ along: 1 | -1 }
  /** the end of an earlier push / pull (a prism step): its depth */
  | { kind: "stepDepth"; step: string; depth: number }
  /** the side of an extruded sketch: the sketch's corners on that side move along the face's outward normal */
  | { kind: "side"; corners: Ref[]; normal: Vec3 }
  /** a fillet or chamfer face: the size of the step that rounded or bevelled the edge (pulling the face out towards the sharp corner makes it smaller) */
  | { kind: "edgeSize"; step: string; value: number }
  | { kind: "radius"; circle: Ref; radius: number; convex: boolean; /** a locked diameter on the circle, which has to be the one changed */ diameter?: string; /** the circle was cut into arcs by lines and is gone: `circle` is the arc of the sketch this wall comes from, and its two ends move along the lines they are on */ arc?: true };

const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

/** The extrusion whose end is this flat face of the body, if exactly one is. */
function endOfExtrusion(scene: Scene, face: Extract<ReturnType<typeof faceOf>, object>): FaceEdit | null {
  const nf = normalOfPlane(face);
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    const part = scene.parts[st.parts[0] ?? ""];
    const pl = part?.plane ? scene.parts[part.plane] : undefined;
    if (!pl || pl.kind !== "plane") continue;
    const n = normalOfPlane(pl);
    const depth = Number(st.params.depth);
    const dn = dot(nf, n);
    if (!Number.isFinite(depth) || Math.abs(Math.abs(dn) - 1) > 1e-6) continue;
    if (near(dot(n, face.at), dot(n, pl.at) + depth)) found.push({ kind: "depth", step: st.id, depth, along: dn > 0 ? 1 : -1 });
  }
  return found.length === 1 ? found[0]! : null;
}

/** The extruded circle whose wall this round face is, if exactly one is. */
function wallOfCircle(scene: Scene, c: Curved, where?: readonly Vec3[]): FaceEdit | null {
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    for (const r0 of figureRefs(st)) {
      // a circle, or an arc of one that lines have cut into pieces (the wall of a piece is the circle's wall)
      const arc = scene.parts[r0];
      const ref = arc?.kind === "line" && arc.derived && arc.center ? Object.values(scene.parts).find((q) => q.kind === "circle" && q.center === arc.center && near(q.radius, c.radius))?.ref ?? r0 : r0;
      if (found.some((x) => x.kind === "radius" && x.circle === ref)) continue;
      const part = scene.parts[ref];
      if (part?.kind === "line" && part.center && ref === r0) { const a = arcWall(scene, r0, c, where); if (a && !found.some((x) => x.kind === "radius" && x.circle === a.circle)) found.push(a); continue; }
      if (part?.kind !== "circle") continue;
      const pl = part.plane ? scene.parts[part.plane] : undefined;
      const centre = scene.parts[part.center];
      if (!pl || pl.kind !== "plane" || centre?.kind !== "corner") continue;
      const n = normalOfPlane(pl);
      const axis: Vec3 = c.dir ?? (c.axis === 0 ? [1, 0, 0] : c.axis === 1 ? [0, 1, 0] : [0, 0, 1]); // (a turned body's wall has its axis as a direction, `in_209`)
      if (Math.abs(Math.abs(dot(n, axis)) - 1) > 1e-5 || !near(part.radius, c.radius, c.dir ? 2e-3 : undefined)) continue;
      const off = sub(centre.at, c.center);
      if (Math.hypot(...sub(off, scale(axis, dot(off, axis)))) > 2e-3) continue;
      const rel = scene.relations.find((r) => r.kind === "diameter" && r.parts.length === 1 && r.parts[0] === ref && r.locked !== false);
      found.push({ kind: "radius", circle: ref, radius: part.radius, convex: c.convex, ...(rel ? { diameter: rel.id } : {}) });
    }
  }
  return found.length === 1 ? found[0]! : null;
}

/** The wall of an arc of an extruded sketch (its circle was cut into arcs by lines and is gone): the sketch's own arc this derived piece comes from, if it has the face's radius and axis. */
function arcWall(scene: Scene, piece: Ref, c: Curved, where?: readonly Vec3[]): Extract<FaceEdit, { kind: "radius" }> | null {
  const own = scene.parts[piece];
  const src = own?.kind === "line" && !own.derived ? own : scene.parts[`d/${piece.split("@")[1] ?? ""}`]; // (an arc of the sketch itself, or the piece of one that lines cut)
  if (src?.kind !== "line" || !src.center || src.derived) return null;
  const [a, ctr] = [scene.parts[src.a], scene.parts[src.center]];
  const pl = src.plane ? scene.parts[src.plane] : undefined;
  if (a?.kind !== "corner" || ctr?.kind !== "corner" || !pl || pl.kind !== "plane") return null;
  const radius = Math.hypot(...sub(a.at, ctr.at));
  const axis: Vec3 = c.dir ?? (c.axis === 0 ? [1, 0, 0] : c.axis === 1 ? [0, 1, 0] : [0, 0, 1]);
  const off = sub(ctr.at, c.center);
  if (!near(radius, c.radius, 2e-3) || Math.abs(Math.abs(dot(normalOfPlane(pl), axis)) - 1) > 1e-5 || Math.hypot(...sub(off, scale(axis, dot(off, axis)))) > 2e-3) return null;
  // the arcs of one circle (the tips of a gear's teeth) all have this radius and axis: it is the one whose span the face lies in (`in_257`)
  if (where && !where.every((q) => inSpan(src, a.at, ctr.at, normalOfPlane(pl), scene.parts[src.b], q))) return null;
  return { kind: "radius", circle: src.ref, radius, convex: c.convex, arc: true };
}
const wrap = (t: number) => ((t % TAU) + TAU) % TAU;
/** Whether the point `q` lies within the arc from corner `a` to its end, round `ctr` (seen along `n`): the angle it makes about the centre is within the arc's sweep. */
function inSpan(arc: Extract<Part, { kind: "line" }>, a: Vec3, ctr: Vec3, n: Vec3, end: Part | undefined, q: Vec3): boolean {
  if (end?.kind !== "corner") return true;
  const angle = (p: Vec3) => { const u = sub(a, ctr); const d = sub(p, ctr); return Math.atan2(dot(n, cross(u, d)), dot(u, d)); };
  const ccw = arc.ccw !== false;
  const sweep = ccw ? wrap(angle(end.at)) : wrap(-angle(end.at));
  if (sweep < 1e-9) return true; // (a whole circle)
  const t = ccw ? wrap(angle(q)) : wrap(-angle(q));
  return t <= sweep + 2e-3 || t >= TAU - 2e-3;
}

const faceOf = (scene: Scene, ref: Ref): Plane | null => { const p = scene.parts[ref]; return p?.kind === "plane" ? p : null; };

/** The end of a push / pull step that made this flat face (a prism that was added at an earlier face), if exactly one did. */
function endOfPrism(scene: Scene, face: Plane): FaceEdit | null {
  const nf = normalOfPlane(face);
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "pushPull") continue;
    const n: Vec3 = [Number(st.params.nx), Number(st.params.ny), Number(st.params.nz)];
    const depth = Number(st.params.depth);
    const fd = Number(st.params.fd);
    if (![...n, depth, fd].every(Number.isFinite) || dot(n, nf) < 1 - 1e-6) continue;
    if (near(dot(nf, face.at), fd + depth)) found.push({ kind: "stepDepth", step: st.id, depth });
  }
  return found.length === 1 ? found[0]! : null;
}

/** The side of an extruded sketch: its lines that lie in this face's plane, if they all belong to one extrusion. */
function sideOfSketch(scene: Scene, face: Plane): FaceEdit | null {
  const nf = normalOfPlane(face);
  const d = dot(nf, face.at);
  const owners = new Set<string>();
  const corners = new Set<Ref>();
  for (const st of scene.steps) {
    if (st.type !== "extrude") continue;
    for (const ref of figureRefs(st)) {
      const l = scene.parts[ref];
      if (l?.kind !== "line" || l.center || l.bulge) continue;
      const [a, b] = [scene.parts[l.a], scene.parts[l.b]];
      if (a?.kind !== "corner" || b?.kind !== "corner" || !a.movable || !b.movable) continue;
      const pl = l.plane ? scene.parts[l.plane] : undefined;
      if (!pl || pl.kind !== "plane" || Math.abs(dot(normalOfPlane(pl), nf)) > 1e-6) continue; // the face stands on the sketch's plane
      if (near(dot(nf, a.at), d) && near(dot(nf, b.at), d)) { owners.add(st.id); corners.add(l.a); corners.add(l.b); }
    }
  }
  return owners.size === 1 ? { kind: "side", corners: [...corners], normal: nf } : null;
}

/** The step that rounded or bevelled the edge this face is the fillet or chamfer of: the one whose size is the smallest extent of the face, if exactly one is. */
function edgeStep(scene: Scene, face: Plane): FaceEdit | null {
  const m = face.mesh;
  if (!m || m.length < 9) return null;
  const found: FaceEdit[] = [];
  for (const st of scene.steps) {
    if (st.type !== "edgeMod") continue;
    // the face is measured where the step made it: the body may have been moved or turned since (`in_207`), which would otherwise stretch its box
    const back = inverse(laterMotion(scene.steps, scene.steps.indexOf(st)));
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < m.length; i += 3) { const q = applyPoint(back, [m[i]!, m[i + 1]!, m[i + 2]!]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]!); hi[k] = Math.max(hi[k]!, q[k]!); } }
    const size = Math.min(...[0, 1, 2].map((k) => hi[k]! - lo[k]!));
    const value = Number(st.params.value);
    if (Number.isFinite(value) && near(value, size, 2e-3)) found.push({ kind: "edgeSize", step: st.id, value });
  }
  return found.length === 1 ? found[0]! : null;
}

/** What editing this face of the body would change, or null when the step that made it cannot be told (then a prism is added, as before). */
export function faceEdit(scene: Scene, ref: Ref): FaceEdit | null {
  const f = faceOf(scene, ref);
  if (!f || f.origin !== "body") return null;
  const pts = (): Vec3[] => { const m = f.mesh ?? []; const out: Vec3[] = []; for (let i = 0; i + 2 < m.length; i += 3) out.push([m[i]!, m[i + 1]!, m[i + 2]!]); return out; };
  if (f.curved) return wallOfCircle(scene, f.curved, f.mesh ? pts() : undefined);
  if (f.rounded) return (f.round && f.radius ? wallOfCircle(scene, { ...f.round, radius: f.radius, lo: 0, hi: 0 }, f.mesh ? pts() : undefined) : null) ?? edgeStep(scene, f); // (a piece of a round wall, else a fillet or chamfer)
  if (!f.mesh) return null;
  const n = normalOfPlane(f);
  const diagonal = n.every((v) => Math.abs(v) < 0.9999);
  return endOfExtrusion(scene, f) ?? endOfPrism(scene, f) ?? sideOfSketch(scene, f) ?? (diagonal ? edgeStep(scene, f) : null);
}

/** The command that moves the face by `v` along its outward normal (a negative `v` pushes it in), or null when that is no size at all. */
export function editCommand(scene: Scene, edit: FaceEdit, v: number): Command | null {
  if (edit.kind === "stepDepth") {
    const depth = edit.depth + v;
    return Math.abs(depth) < 1e-6 ? null : { type: "setStepParams", id: edit.step, params: { depth: Math.round(depth * 1e6) / 1e6 } };
  }
  if (edit.kind === "edgeSize") {
    const value = Math.round((edit.value - v) * 1e6) / 1e6;
    // pulled all the way back to nothing: there is no fillet or chamfer any more, the step that made it goes
    return value > 1e-6 ? { type: "setStepParams", id: edit.step, params: { value } } : { type: "removeStep", id: edit.step };
  }
  if (edit.kind === "side") {
    const nf = edit.normal;
    const moved = new Set(edit.corners);
    const moves = edit.corners.flatMap((ref): Command[] => {
      const c = scene.parts[ref];
      if (c?.kind !== "corner") return [];
      // the side keeps the sides next to it and they are extended or cut to meet it (a hexagon stays a hexagon, only bigger): the new corner is where the next side's line meets the moved side. If there is no single straight
      // side to go along (an arc, a corner of three lines) the corner just moves along the face's normal
      const others = Object.values(scene.parts).filter((p): p is Extract<typeof p, { kind: "line" }> => p.kind === "line" && p.origin === "drawn" && (p.a === ref || p.b === ref) && !(moved.has(p.a) && moved.has(p.b)));
      const o = others.length === 1 && !others[0]!.center && !others[0]!.bulge ? others[0]! : null;
      const far = o ? scene.parts[o.a === ref ? o.b : o.a] : null;
      if (o && far?.kind === "corner") {
        const dir: Vec3 = [far.at[0] - c.at[0], far.at[1] - c.at[1], far.at[2] - c.at[2]];
        const along = dot(nf, dir);
        const len = Math.hypot(...dir);
        if (len > 1e-9 && Math.abs(along) / len > 1e-3) {
          const t = v / along; // c + t * dir is where the line from this corner to the next one is cut by the moved side
          return [{ type: "movePart", ref, to: [c.at[0] + dir[0] * t, c.at[1] + dir[1] * t, c.at[2] + dir[2] * t] }];
        }
      }
      return [{ type: "movePart", ref, to: [c.at[0] + nf[0] * v, c.at[1] + nf[1] * v, c.at[2] + nf[2] * v] }];
    });
    // an arc next to the moved side keeps its two ends the same distance from its middle (that is what an arc is): its middle goes to the nearest point on the middle line of its new chord, so the arc just
    // changes size and span instead of the sketch pushing the corner back (`in_227`)
    // the corners that sit on the same spot as a moved one (the end of an arc, of another line, that meets it there: nothing joins them but where they are) go with it, or the sketch would come apart (`in_229`)
    for (const m of [...moves]) {
      if (m.type !== "movePart") continue;
      const here = scene.parts[m.ref];
      if (here?.kind !== "corner") continue;
      for (const q of Object.values(scene.parts)) if (q.kind === "corner" && q.origin === "drawn" && q.movable && q.ref !== m.ref && q.plane === here.plane && !moved.has(q.ref) && Math.hypot(q.at[0] - here.at[0], q.at[1] - here.at[1], q.at[2] - here.at[2]) < 1e-4 && !moves.some((x) => x.type === "movePart" && x.ref === q.ref)) moves.push({ type: "movePart", ref: q.ref, to: m.to });
    }
    const to = new Map<Ref, Vec3>(moves.flatMap((m) => (m.type === "movePart" ? [[m.ref, m.to] as const] : [])));
    const centres = new Map<Ref, Vec3>();
    for (const l of Object.values(scene.parts)) {
      if (l.kind !== "line" || l.origin !== "drawn" || !l.center || l.bulge || (!to.has(l.a) && !to.has(l.b)) || to.has(l.center) || centres.has(l.center)) continue;
      const [ca, cb, cc, pl] = [scene.parts[l.a], scene.parts[l.b], scene.parts[l.center], l.plane ? scene.parts[l.plane] : undefined];
      if (ca?.kind !== "corner" || cb?.kind !== "corner" || cc?.kind !== "corner" || pl?.kind !== "plane" || !cc.movable) continue;
      const [a, b] = [to.get(l.a) ?? ca.at, to.get(l.b) ?? cb.at];
      const chord = sub(b, a);
      if (Math.hypot(...chord) < 1e-9) continue;
      const bis = normalize(cross(normalOfPlane(pl), chord)); // (across the chord, in the sketch's plane)
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const t = dot(sub(cc.at, mid), bis);
      const at: Vec3 = [mid[0] + bis[0] * t, mid[1] + bis[1] * t, mid[2] + bis[2] * t];
      if (Math.hypot(...sub(at, cc.at)) > 1e-9) centres.set(l.center, at);
    }
    for (const [ref, at] of centres) moves.push({ type: "movePart", ref, to: at });
    // the face's normal is the kernel's, a few digits only: what it moves a corner by must not take it off the sketch's plane (a corner a micrometre off it is not in the drawing any more, and a step made from it
    // loses its shape: "select lines to extrude", `in_231`)
    for (const m of moves) {
      if (m.type !== "movePart") continue;
      const c = scene.parts[m.ref];
      const pl = c?.kind === "corner" && c.plane ? scene.parts[c.plane] : undefined;
      if (pl?.kind !== "plane") continue;
      const n = normalOfPlane(pl);
      const off = dot(sub(m.to, pl.at), n);
      m.to = [m.to[0] - n[0] * off, m.to[1] - n[1] * off, m.to[2] - n[2] * off];
    }
    // lines tangent to arcs: the arcs' sizes follow the side, as the solver finds them, and the figure is left exactly closed (it is the solver's answer, not the guess above, which stays when the solver finds none)
    if (moves.length && scene.relations.some((r) => r.kind === "tangent")) {
      const first = apply(scene, { type: "batch", commands: moves });
      const settled = first.ok ? solvedMoves(scene, first.value) : null;
      if (settled?.length) return { type: "batch", commands: settled };
    }
    return moves.length ? { type: "batch", commands: moves } : null;
  }
  if (edit.kind === "depth") {
    const depth = edit.depth + v * edit.along;
    return Math.abs(depth) < 1e-6 ? null : { type: "setStepParams", id: edit.step, params: { depth: Math.round(depth * 1e6) / 1e6 } };
  }
  const radius = Math.round((edit.radius + (edit.convex ? v : -v)) * 1e6) / 1e6;
  if (!(radius > 1e-6)) return null;
  if (edit.arc) return arcRadiusCommand(scene, edit.circle, radius);
  return edit.diameter ? { type: "setRelationValue", id: edit.diameter, value: 2 * radius, locked: true } : { type: "setRadius", ref: edit.circle, radius };
}

/**
 * The corners of drawn figures that sit on the same spot (the end of a line and the end of an arc that meet there: nothing but where they are joins them). A line tangent to an arc touches it at one point, and
 * "on the line" and "on the circle" at once is a double root for the solver: it leaves such a pair a hair apart (2e-5), which is enough for a step made from the sketch to lose its shape. They are put back on
 * one spot after solving (`in_231`).
 */
function partnerGroups(scene: Scene): Ref[][] {
  const cs = Object.values(scene.parts).filter((p): p is Extract<typeof p, { kind: "corner" }> => p.kind === "corner" && p.origin === "drawn" && p.movable && !!p.plane);
  const out: Ref[][] = [];
  const seen = new Set<Ref>();
  for (const c of cs) {
    if (seen.has(c.ref)) continue;
    const g = cs.filter((q) => !seen.has(q.ref) && q.plane === c.plane && Math.hypot(...sub(q.at, c.at)) < 1e-4).map((q) => q.ref);
    for (const r of g) seen.add(r);
    if (g.length > 1) out.push(g);
  }
  return out;
}
/** The moves that take `scene` to what the solver makes of `start` (a scene with the edit made): the partners kept together, and settled by solving again. Null if the solver finds a conflict. */
function solvedMoves(scene: Scene, start: Scene): Command[] | null {
  const groups = partnerGroups(scene);
  let cur = start;
  for (let i = 0; i < 3; i++) {
    const sv = solveScene(cur);
    if (sv.planes.some((p) => p.status === "conflict")) return null;
    cur = sv.scene;
    for (const g of groups) {
      const first = cur.parts[g[0]!];
      if (first?.kind !== "corner") continue;
      for (const r of g.slice(1)) { const q = cur.parts[r]; if (q?.kind === "corner" && Math.hypot(...sub(q.at, first.at)) > 0) { const m = apply(cur, { type: "movePart", ref: r, to: first.at }); if (m.ok) cur = m.value; } }
    }
  }
  const moves: Command[] = [];
  for (const q of Object.values(scene.parts)) {
    if (q.origin !== "drawn" || !q.movable) continue;
    const w = cur.parts[q.ref];
    if (q.kind === "corner" && w?.kind === "corner" && Math.hypot(...sub(w.at, q.at)) > 1e-12) moves.push({ type: "movePart", ref: q.ref, to: w.at });
    else if (q.kind === "circle" && w?.kind === "circle" && Math.abs(w.radius - q.radius) > 1e-12) moves.push({ type: "setRadius", ref: q.ref, radius: w.radius });
  }
  return moves;
}

/** A new radius for an arc whose circle is gone: both ends slide along the lines they are on to the new radius about the same middle (the arc keeps its lines, `in_209`). Null if a line does not reach that radius. */
function arcCommand(scene: Scene, arc: Ref, radius: number): Command | null {
  const l = scene.parts[arc];
  if (l?.kind !== "line" || !l.center) return null;
  const ctr = scene.parts[l.center];
  if (ctr?.kind !== "corner") return null;
  const moves: Command[] = [];
  for (const endRef of [l.a, l.b]) {
    const end = scene.parts[endRef];
    const rel = scene.relations.find((r) => r.kind === "onLine" && r.parts[0] === endRef);
    // the line the end slides along: the one it is put on, or a straight side of the sketch that ends there
    const line = rel ? scene.parts[rel.parts[1]!] : Object.values(scene.parts).find((q) => q.kind === "line" && q.origin === "drawn" && !q.center && !q.bulge && (q.a === endRef || q.b === endRef));
    const [p, q] = line?.kind === "line" ? [scene.parts[line.a], scene.parts[line.b]] : [];
    if (end?.kind !== "corner" || p?.kind !== "corner" || q?.kind !== "corner") return null;
    const d = sub(q.at, p.at);
    const f = sub(p.at, ctr.at);
    const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - radius * radius;
    const disc = B * B - 4 * A * C;
    if (A < 1e-12 || disc < 0) return null;
    const ts = [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)];
    const at = ts.map((t): Vec3 => [p.at[0] + d[0] * t, p.at[1] + d[1] * t, p.at[2] + d[2] * t]);
    const best = at.reduce((x, y) => (Math.hypot(...sub(y, end.at)) < Math.hypot(...sub(x, end.at)) ? y : x));
    // the corners that sit on the same spot (the ends of the lines that meet the arc there) go with it, or the sketch would come apart
    for (const q of Object.values(scene.parts)) if (q.kind === "corner" && q.origin === "drawn" && q.movable && Math.hypot(...sub(q.at, end.at)) < 1e-4) moves.push({ type: "movePart", ref: q.ref, to: best });
  }
  return { type: "batch", commands: moves };
}

/**
 * A new radius for an arc whose circle is gone (`in_229`). If lines are tangent to the arc the radius is asked of the solver (with a radius that is not kept afterwards), and what it moves is moved: the
 * lines turn to stay tangent and the other arcs and circles they touch change size, as when a tangent line is moved. Else, or if the solver cannot, the ends slide along their lines (`arcCommand`).
 */
export function arcRadiusCommand(scene: Scene, arc: Ref, radius: number): Command | null {
  if (isTangentArc(scene, arc)) {
    const added = apply(scene, { type: "addRelation", relation: { id: nextId(scene, "r"), kind: "radius", parts: [arc], value: radius, locked: true } });
    if (added.ok) {
      const moves = solvedMoves(scene, added.value);
      if (moves?.length) return { type: "batch", commands: moves };
    }
    return null; // (the lines cannot stay tangent at that radius: the arc is not changed in a way that lets go of them)
  }
  return arcCommand(scene, arc, radius);
}

/** Whether a line is tangent to this arc (or circle): its radius is then changed by the solver, so the lines stay tangent (`in_229`). */
export const isTangentArc = (scene: Scene, arc: Ref): boolean => scene.relations.some((r) => r.kind === "tangent" && r.parts.includes(arc));
