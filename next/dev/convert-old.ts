// The converter (stage 2): the old app's kernel operation list (dumped by prototypes/real-models/dump.ts) replayed into the new engine, one operation at a time.
//   node --experimental-strip-types dev/convert-old.ts <model> [--steps]
// The old operations name faces and edges by where they are (end points, a normal and an offset); the new recipe names them by id. So each old reference is resolved ONCE, here, against the new body
// as it is at that point (the one moment a position is the only thing there is to go on); from then on the recipe is ids. The result is compared with what the old kernel made (volume, box).
import { readFileSync } from "node:fs";
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { type EdgeRef, type Id } from "../src/engine/id.ts";
import { kinds, type Step } from "../src/engine/steps.ts";

type V3 = [number, number, number];
export interface Dump { name: string; graph: { ops: any[] }; old: { volume: number | null; bbox: { min: V3; max: V3 } | null; bodies: { min: V3; max: V3; volume: number }[]; errors: unknown[] } }
export interface Outcome { name: string; ops: number; status: string; newVolume: number | null; oldVolume: number | null; why: string; steps: Step[] }

const AXES: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const close = (a: V3, b: V3, tol: number) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class Unsupported extends Error {}

export function convert(dump: Dump): Outcome {
  const steps: Step[] = [], engine = new Engine([]), bodyOf = new Map<string, string>(), sketchOf = new Map<string, string>();
  const out = (status: string, why: string, v: number | null = null): Outcome => { const o: Outcome = { name: dump.name, ops: dump.graph.ops.length, status, newVolume: v, oldVolume: dump.old.volume, why, steps }; engine.release(); return o; };
  const add = (s: Step) => { steps.push(s); engine.setRecipe([...steps]); const r = engine.result(s.id); if (r.status.kind !== "ok") throw new Error(`${s.id} (${s.kind}) ${r.status.kind}: ${"why" in r.status ? r.status.why : ""}`); return s.id; };
  const bodyAt = (stepId: string): Body => { const v = engine.result(stepId).value; if (!(v instanceof Body)) throw new Error(`${stepId} has no body`); return v; };
  const need = <T,>(m: Map<string, T>, id: string, what: string): T => { const v = m.get(id); if (v === undefined) throw new Unsupported(`${what} ${id} was not converted`); return v; };

  /** an old edge (its ends, its middle) in the body: the edge of the new body that is there, as the pair of faces beside it */
  const approx: string[] = [];
  /**
   * An old edge in the body: the edge of the new body that lies on its points (wherever a closed edge starts). The old kernel also took the nearest edge when its own numbers had gone stale
   * ("if clearly the nearest", `dec_stable_references`); so does this, and says so: the volume and the box at the end show whether the guess was right.
   */
  const edgeRefAt = (stepId: string, d: { a: V3; b: V3; mid: V3 }): EdgeRef => {
    const body = bodyAt(stepId), cands: { ref: EdgeRef; err: number; ends: number }[] = [];
    for (const e of body.edges()) {
      if (!e.ref) continue;
      const err = Math.max(K.distanceToEdge(d.a, e.h), K.distanceToEdge(d.b, e.h), K.distanceToEdge(d.mid, e.h)), [p, q] = K.edgeEnds(e.h);
      const ends = Math.min(Math.hypot(...p.map((v, i) => v - d.a[i]!)) + Math.hypot(...q.map((v, i) => v - d.b[i]!)), Math.hypot(...p.map((v, i) => v - d.b[i]!)) + Math.hypot(...q.map((v, i) => v - d.a[i]!)));
      cands.push({ ref: e.ref, err, ends });
    }
    cands.sort((x, y) => x.err - y.err || x.ends - y.ends);
    const best = cands[0], second = cands[1];
    if (!best) throw new Unsupported(`no edges in ${stepId}`);
    if (best.err > 0.02) {
      if (best.err < 25 && (!second || second.err > 1.5 * best.err + 0.1)) approx.push(`edge near ${JSON.stringify(d.mid)} taken as the nearest (off by ${best.err.toFixed(2)})`);
      else throw new Unsupported(`no edge through ${JSON.stringify(d.mid)} in ${stepId} (nearest off by ${best.err.toFixed(3)}, next ${second ? second.err.toFixed(3) : "-"})`);
    }
    return best.ref;
  };
  /** an old face (a plane: normal, offset, a point on it) in the body: the id of the face of the new body that is there */
  const faceIdAt = (stepId: string, d: { n: V3; d: number; point: V3 }): Id => {
    const body = bodyAt(stepId); let best: { id: Id; err: number } | null = null;
    for (const f of body.faces) {
      const q = K.facts(f.h); if (q.type !== "PLANE" || dot(q.ne, d.n) < 0.999999) continue;
      const off = Math.abs(dot(d.point, q.ne) - dot(q.ce, q.ne)), inside = d.point.every((v, i) => v >= q.lo[i]! - 1e-3 && v <= q.hi[i]! + 1e-3);
      if (off < 1e-3 && inside && (!best || off < best.err)) best = { id: f.id, err: off };
    }
    if (!best) throw new Unsupported(`no flat face through ${JSON.stringify(d.point)} in ${stepId}`);
    return best.id;
  };

  // `clear` throws away every body made so far, so only what comes after the last one matters; a sketch drawn before it can still be used after it, so sketches are made when something uses them
  const all = dump.graph.ops as any[], lastClear = all.map((o) => o.type).lastIndexOf("clear"), sketchOps = new Map<string, any>(all.filter((o) => o.type === "sketch").map((o) => [o.id, o]));
  const sketch = (id: string): string => {
    const known = sketchOf.get(id); if (known) return known;
    const op = sketchOps.get(id); if (!op) throw new Unsupported(`sketch ${id} was not converted`);
    const f = op.frame as { origin: V3; xDir: V3; normal: V3 }, off = (op.origin as number) ?? 0, frame = { origin: f.origin.map((v, i) => v + f.normal[i]! * off) as V3, xDir: f.xDir, normal: f.normal };
    const sid = add(op.shape === "circle" ? { id: `S${op.id}`, kind: "sketchCircle", params: { frame, r: op.radius, center: op.at }, inputs: [] } : { id: `S${op.id}`, kind: "sketchPolygon", params: { frame, points: op.points, mids: op.mids ?? [] }, inputs: [] });
    sketchOf.set(id, sid); return sid;
  };
  try {
    for (const op of all.slice(lastClear + 1)) {
      switch (op.type) {
        case "sketch": break; // made when used
        case "SKETCH_OLD": {
          const f = op.frame as { origin: V3; xDir: V3; normal: V3 }, off = (op.origin as number) ?? 0, frame = { origin: f.origin.map((v, i) => v + f.normal[i]! * off) as V3, xDir: f.xDir, normal: f.normal };
          sketchOf.set(op.id, add(op.shape === "circle" ? { id: `S${op.id}`, kind: "sketchCircle", params: { frame, r: op.radius, center: op.at }, inputs: [] } : { id: `S${op.id}`, kind: "sketchPolygon", params: { frame, points: op.points, mids: op.mids ?? [] }, inputs: [] }));
          break;
        }
        case "extrude": {
          const mode = op.mode as string, d = op.distance as number, name = `X${op.id}`;
          let tool = add({ id: `${name}`, kind: "extrude", params: { d }, inputs: [sketch(op.profile), ...((op.holes ?? []) as string[]).map((h) => sketch(h))] });
          (op.also ?? []).forEach((x: { profile: string; holes: string[] }, i: number) => {
            const more = add({ id: `${name}a${i}`, kind: "extrude", params: { d }, inputs: [sketch(x.profile), ...x.holes.map((h) => sketch(h))] });
            tool = add({ id: `${name}u${i}`, kind: "combine", params: { mode: "add", unify: false }, inputs: [tool, more] });
          });
          if (mode === "new" || !op.target) { bodyOf.set(op.id, tool); break; }
          const combine = mode === "cut" ? "cut" : mode === "add" ? "add" : d < 0 ? "cut" : "add"; // cutOrAdd: pulled below its plane it cuts
          bodyOf.set(op.id, add({ id: `${name}c`, kind: "combine", params: { mode: combine }, inputs: [need(bodyOf, op.target, "body"), tool] }));
          break;
        }
        case "edgeMod": {
          const target = need(bodyOf, op.target, "body"), refs = (op.ref as { a: V3; b: V3; mid: V3 }[]).map((r) => edgeRefAt(target, r));
          bodyOf.set(op.id, add({ id: `M${op.id}`, kind: op.mode === "chamfer" ? "chamfer" : "fillet", params: { edges: refs, [op.mode === "chamfer" ? "d" : "r"]: op.value }, inputs: [target] }));
          break;
        }
        case "faceExtrude": {
          const target = need(bodyOf, op.target, "body");
          bodyOf.set(op.id, add({ id: `F${op.id}`, kind: "push", params: { face: faceIdAt(target, op.ref), dist: op.distance }, inputs: [target] }));
          break;
        }
        case "transform": {
          if (op.body && op.body !== op.target) throw new Unsupported("a move or turn of one body of several");
          const target = need(bodyOf, op.target, "body");
          if (op.mode === "move") { const by: V3 = op.vec ?? (AXES[op.axis]!.map((v) => v * op.value) as V3); bodyOf.set(op.id, add({ id: `T${op.id}`, kind: "move", params: { by }, inputs: [target] })); }
          else if (op.mode === "rotate") bodyOf.set(op.id, add({ id: `T${op.id}`, kind: "turn", params: { axis: AXES[op.axis], deg: op.value, pivot: op.pivot ?? [0, 0, 0] }, inputs: [target] }));
          else throw new Unsupported(`transform ${op.mode}`);
          break;
        }
        default: throw new Unsupported(`the operation ${op.type}${op.mode ? ":" + op.mode : ""}`);
      }
    }
    // the bodies the recipe ends with: body steps nothing else works on
    const used = new Set(steps.flatMap((s) => s.inputs)), heads = steps.filter((s) => kinds[s.kind]?.outputs === "body" && !used.has(s.id));
    let vol = 0; const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const h of heads) { const b = bodyAt(h.id); vol += K.volume(b.solid); for (const f of b.faces) { const q = K.facts(f.h); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, q.lo[i]!); hi[i] = Math.max(hi[i]!, q.hi[i]!); } } }
    const ov = dump.old.volume ?? NaN, box = dump.old.bbox, relV = Math.abs(vol - ov) / Math.max(1e-9, Math.abs(ov));
    const boxOff = box ? Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(lo[i]! - box.min[i]!), Math.abs(hi[i]! - box.max[i]!)])) : 0;
    if (dump.old.errors.length) return out("old kernel failed too", JSON.stringify(dump.old.errors[0]).slice(0, 100), vol);
    const guessed = approx.length ? `; ${approx.length} stale edge(s) taken as the nearest` : "";
    if (relV < 2e-3 && boxOff < 0.05) return out("same", `${heads.length} body step(s)${guessed}`, vol);
    return out("DIFFERENT", `volume ${vol.toFixed(3)} against ${ov.toFixed(3)} (${(100 * relV).toFixed(2)}%), box off by ${boxOff.toFixed(3)}; ${heads.length} body step(s)${guessed}`, vol);
  } catch (e) {
    if (e instanceof Unsupported) return out("unsupported", e.message);
    return out("FAILED", e instanceof Error ? e.message.slice(0, 220) : String(e));
  }
}

if (process.argv[1]?.endsWith("convert-old.ts")) {
  await initKernel();
  const name = process.argv[2]!, dump = JSON.parse(readFileSync(new URL(`../../prototypes/real-models/dump/${name}.json`, import.meta.url), "utf8")) as Dump, o = convert(dump);
  console.log(`${o.name.padEnd(44)} ${String(o.ops).padStart(3)} ops  ${o.status.padEnd(12)} ${o.why}`);
  if (process.argv.includes("--steps")) for (const s of o.steps) console.log("   ", s.id, s.kind, s.inputs.join(","), JSON.stringify(s.params).slice(0, 160));
}
