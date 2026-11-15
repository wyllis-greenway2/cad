// Scaling a model along x, y and z by different amounts (`dec_scale_axes`, `in_388`): the recipe is stretched, not the solid. Every drawn point, plane and size, and every distance of a step, is scaled about a
// pivot, one factor for each world axis, so the extrusions that make the body come out as exact prisms again. Only what stays exact is allowed: extrusions and moves, planes that face along an axis, circles
// that are scaled the same both ways across their plane; the rest is refused with the reason. A stretch can be of the whole model, of one body of several (the one extrusion that made it, and the moves of it),
// or of a drawn figure alone (`in_390`). Pure: a scene in, a scene or a reason out.
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Ref } from "../shared/ref.ts";
import type { Scene, Step, Relation } from "./scene.ts";
import type { Part } from "./part.ts";
import { normalOfPlane } from "./part.ts";
import { figureDepths, figureRefs } from "./scene.ts";

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const axisOf = (n: Vec3): 0 | 1 | 2 | null => { const k = [0, 1, 2].find((i) => Math.abs(Math.abs(n[i]!) - 1) < 1e-6); return k === undefined ? null : (k as 0 | 1 | 2); };

/** What a stretch covers: the whole model (none), one body of several by its name, or drawn parts alone. */
export interface StretchScope { body?: string; parts?: readonly Ref[] }

/** The drawn parts a step stands on, with the corners of its lines and circles. */
function drawnOf(s: Scene, refs: readonly Ref[]): Set<Ref> {
  const out = new Set<Ref>();
  for (const r of refs) {
    const p = s.parts[r];
    if (!p) continue;
    out.add(r);
    if (p.kind === "line") { out.add(p.a); out.add(p.b); if (p.center) out.add(p.center); }
    if (p.kind === "circle") out.add(p.center);
    if (p.kind === "face") for (const c of [...p.loop, ...p.corners, ...(p.disk ? [p.disk] : [])]) { out.add(c); const q = s.parts[c]; if (q?.kind === "line") { out.add(q.a); out.add(q.b); if (q.center) out.add(q.center); } if (q?.kind === "circle") out.add(q.center); }
  }
  return out;
}

/** The scene with the model (or what `scope` names) stretched by `f` (all positive) about `pivot`, or why that cannot be done exactly. */
export function stretchScene(s: Scene, f: Vec3, pivot: Vec3, scope: StretchScope = {}): Result<Scene> {
  if (!f.every((k) => k > 1e-6 && Number.isFinite(k))) return err("a scale must be more than nothing");
  const uniform = Math.abs(f[0] - f[1]) < 1e-12 && Math.abs(f[1] - f[2]) < 1e-12;
  // which steps and which drawn parts are covered
  let mySteps: Set<string> | null = null; // null: every step
  let mine: Set<Ref> | null = null; // null: every drawn part
  if (scope.body) {
    const maker = s.steps.find((st) => st.type === "extrude" && `x_${st.id}` === scope.body);
    if (!maker) return err("that body was not made by one extrusion, so it cannot be stretched alone yet");
    mySteps = new Set([maker.id]);
    for (const st of s.steps) {
      if (st.id === maker.id) continue;
      if (st.params.body === scope.body) { if (st.type !== "move") return err(`a ${st.type === "edgeMod" ? "fillet or chamfer" : st.type} step of this body cannot be stretched yet`); mySteps.add(st.id); }
      else if (!st.params.body && (st.type === "move" || st.type === "rotate" || st.type === "scale" || st.type === "pattern" || st.type === "combine" || st.type === "delete")) return err("a step that works on the whole model comes after this body, so it cannot be stretched alone");
    }
    mine = drawnOf(s, figureRefs(maker));
    // what the other steps stand on is not ours
    for (const st of s.steps) if (st.id !== maker.id && st.type === "extrude") for (const r of drawnOf(s, figureRefs(st))) if (mine.has(r)) return err("another extrusion shares a drawn point with this body");
  } else if (scope.parts) {
    mine = drawnOf(s, scope.parts);
    for (const p of Object.values(s.parts)) if (p.kind === "line" && mine.has(p.a) && mine.has(p.b)) mine.add(p.ref); // (the lines between the corners, arcs among them)
    mySteps = new Set();
    for (const st of s.steps) if (st.type === "extrude") for (const r of drawnOf(s, figureRefs(st))) if (mine.has(r)) return err("this drawing made a body: scale the body");
  }
  const inSteps = (st: Step) => !mySteps || mySteps.has(st.id);
  for (const st of s.steps) {
    if (!inSteps(st)) continue;
    if (st.type !== "extrude" && st.type !== "move" && st.type !== "edgeMod") return err(`a body that has a ${st.type === "pushPull" ? "push / pull" : st.type} step cannot be stretched along one axis yet (it can be scaled all together)`);
  }
  if (!mySteps && s.patterns?.length && !uniform) return err("a repeat cannot be stretched along one axis yet");
  const to = (p: Vec3): Vec3 => [r6(pivot[0] + (p[0] - pivot[0]) * f[0]), r6(pivot[1] + (p[1] - pivot[1]) * f[1]), r6(pivot[2] + (p[2] - pivot[2]) * f[2])];
  const planeAxis = (ref: Ref | null | undefined): 0 | 1 | 2 | null => { const pl = ref ? s.parts[ref] : undefined; return pl?.kind === "plane" ? axisOf(normalOfPlane(pl)) : null; };
  const covered = (ref: Ref) => !mine || mine.has(ref);
  const parts: Record<string, Part> = { ...s.parts };
  for (const p of Object.values(s.parts)) {
    if (p.origin !== "drawn") continue;
    if (p.kind === "plane") {
      if (!uniform && axisOf(normalOfPlane(p)) === null) { if (!mine || Object.values(s.parts).some((q) => q.plane === p.ref && covered(q.ref))) return err("a sketch plane that is tilted cannot be stretched along one axis"); continue; }
      const users = Object.values(s.parts).filter((q) => q.plane === p.ref && q.kind !== "face");
      if (!mine || (users.length > 0 && users.every((q) => mine!.has(q.ref)))) parts[p.ref] = { ...p, at: to(p.at) };
      else if (users.some((q) => mine!.has(q.ref))) {
        // the plane is shared with drawing that stays: it can only stay where it is, so what is stretched must not move across it
        const c = axisOf(normalOfPlane(p));
        if (c === null || Math.abs(to(p.at)[c]! - p.at[c]!) > 1e-9) return err("the plane this is drawn on is shared with a drawing that stays, and the stretch would move it");
      }
      continue;
    }
    if (!covered(p.ref)) continue;
    if (p.kind === "corner") parts[p.ref] = { ...p, at: to(p.at) };
    else if (p.kind === "circle" || (p.kind === "line" && p.center)) {
      // a circle or an arc is across its plane's two axes: stretched differently they would be an ellipse
      const c = planeAxis(p.plane);
      if (c === null && !uniform) return err("a circle on a tilted plane cannot be stretched along one axis");
      const [a, b] = [0, 1, 2].filter((i) => i !== c);
      if (!uniform && Math.abs(f[a!]! - f[b!]!) > 1e-9) return err("a circle or an arc would become an ellipse: scale its two directions the same, or scale all together");
      if (p.kind === "circle") parts[p.ref] = { ...p, radius: r6(p.radius * (uniform ? f[0] : f[a!]!)) };
    }
  }
  const steps: Step[] = [];
  for (const st of s.steps) {
    if (!inSteps(st)) { steps.push(st); continue; }
    if (st.type === "move") {
      const p = { ...st.params };
      if (p.vx !== undefined) { p.vx = r6(Number(p.vx) * f[0]); p.vy = r6(Number(p.vy) * f[1]); p.vz = r6(Number(p.vz) * f[2]); }
      else p.value = r6(Number(p.value ?? 0) * f[Number(p.axis ?? 0)]!);
      steps.push({ ...st, params: p });
      continue;
    }
    if (st.type === "edgeMod") { steps.push(st); continue; } // (a fillet or chamfer keeps its size and finds its edges again by how they look: it is checked by the kernel)
    // an extrusion goes along its plane's normal: its distance is scaled by that axis's factor
    const first = st.parts[0] ? s.parts[st.parts[0]] : undefined;
    const c = first && (first.kind === "line" || first.kind === "circle" || first.kind === "corner") ? planeAxis(first.plane) : null;
    if (c === null && !uniform) return err("an extrusion from a tilted plane cannot be stretched along one axis");
    const k = f[c ?? 0]!;
    const depths = figureDepths(st);
    steps.push({ ...st, params: { ...st.params, depth: r6(depths[0]! * k), ...(st.params.alsoDepth !== undefined ? { alsoDepth: depths.slice(1).map((d) => r6(d * k)).join("|") } : {}) } });
  }
  // the numbers constraints keep follow the stretched drawing (a length, a diameter, a distance between two points); other numbers would not stay true
  const at = (ref: Ref): Vec3 | null => { const q = parts[ref]; return q?.kind === "corner" ? q.at : null; };
  const relations: Relation[] = [];
  for (const rel of s.relations) {
    const inside = rel.parts.filter((x) => covered(x));
    if (mine && inside.length === 0) { relations.push(rel); continue; }
    if (mine && inside.length < rel.parts.length) return err(`a ${rel.kind} constraint ties this to something that stays`);
    if (!uniform && ["equalLength", "equalRadius", "tangent", "angle"].includes(rel.kind)) return err(`a ${rel.kind} constraint would not stay true when stretched along one axis`);
    if (rel.value === undefined) { relations.push(rel); continue; }
    let value: number | null = null;
    const first = parts[rel.parts[0]!];
    if (rel.kind === "length" && first?.kind === "line") { const [a, b] = [at(first.a), at(first.b)]; value = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null; }
    else if (rel.kind === "diameter" && first?.kind === "circle") value = first.radius * 2;
    else if (rel.kind === "distance" && rel.parts.length === 2) { const [a, b] = [at(rel.parts[0]!), at(rel.parts[1]!)]; value = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null; }
    if (value === null && uniform) value = rel.value * f[0];
    if (value === null) return err(`the number of a ${rel.kind} constraint would not stay true when stretched along one axis`);
    relations.push({ ...rel, value: r6(value) });
  }
  return ok({ ...s, parts, steps, relations });
}
