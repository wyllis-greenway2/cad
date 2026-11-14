// The scene as an operation graph for the kernel (`dec_clean_engine_design` section 7): steps in order, closed loops of lines (or a circle) as the profiles.
// Pure: no kernel, no browser. A step that cannot be built is reported with the reason, and the steps after it that need it are skipped by the kernel.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize, sub } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { lookup, figuresOf } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, loopSteps } from "../operation/part.ts";
import type { KernelGraph, KernelOp } from "./kernel/adapter.ts";
import { decodeEdge, decodeFace } from "./body.ts";
import { loopOf } from "../operation/loops.ts";
import { NONE, applyPoint, applyDir, inverse, laterMotion } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
export { loopOf };

export interface GraphResult { graph: KernelGraph; errors: Record<string, string> }

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
// (the frame is read back through the moves that came after it, which gives the same numbers to about 1e-14 whichever moves they are: rounded, so that the kernel's memory of what it made from it can tell it is the same sketch, `in_252`)
const r9 = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
const frameOf = (pl: Plane, back: Rigid = NONE) => ({ origin: [...applyPoint(back, pl.at)].map(r9), xDir: [...applyDir(back, normalize(pl.u))].map(r9), normal: [...applyDir(back, normalOfPlane(pl))].map(r9) });
const to2d = (pl: Plane, p: Vec3, k = 1): [number, number] => {
  const d = sub(p, pl.at);
  return [r6(k * (d[0] * pl.u[0] + d[1] * pl.u[1] + d[2] * pl.u[2])), r6(k * (d[0] * pl.v[0] + d[1] * pl.v[1] + d[2] * pl.v[2]))];
};

export function buildGraph(scene: Scene): GraphResult {
  const get = lookup(scene);
  const ops: KernelOp[] = [];
  const errors: Record<string, string> = {};
  let prev: string | null = null;
  // consecutive fillets (or chamfers) of one kind: the body before the first of them and all of them so far, so that a fillet that cannot be made on its own (next to ones already made) can be tried together with them
  let chain: { base: string | null; mode: string; mods: { ref: unknown; value: number }[] } | null = null;

  const profile = (st: Step, refs: readonly Ref[] = st.parts, sid = `s_${st.id}`): KernelOp | string => {
    const first = get(refs[0]!);
    if (!first) return "a part of this step is gone";
    const plane = first.plane ? get(first.plane) : undefined;
    if (!plane || plane.kind !== "plane") return "the shape is not on a plane";
    // (the sketch is carried with the body; the extrude reads it back through the moves and turns that came after it, `in_204`; a move of one body of several counts for a sketch drawn on a face of that body, `in_277`)
    const back = inverse(laterMotion(scene.steps, scene.steps.indexOf(st), (body) => plane.body === body));
    const id = sid;
    if (first.kind === "circle") {
      const c = pointOf(get, first.center);
      if (!c) return "the circle's centre is gone";
      return { id, type: "sketch", shape: "circle", radius: r6(first.radius * back.k), at: to2d(plane, c, back.k), plane: "XY", origin: 0, frame: frameOf(plane, back) };
    }
    const loop = loopOf(get, refs);
    if (!loop.ok) return loop.error;
    if (loop.corners.some((c) => !pointOf(get, c))) return "a corner of the shape is gone";
    const steps = loopSteps(get, refs, loop.corners); // (a side that is an arc has its middle point: the kernel draws a true arc through the two corners and it)
    return { id, type: "sketch", shape: "polygon", points: steps.map((p) => to2d(plane, p.at, back.k)), ...(steps.some((p) => p.mid) ? { mids: steps.map((p) => (p.mid ? to2d(plane, p.mid, back.k) : null)) } : {}), plane: "XY", origin: 0, frame: frameOf(plane, back) };
  };

  for (const st of scene.steps) {
    const xid = `x_${st.id}`;
    switch (st.type) {
      case "extrude": {
        const distance = Number(st.params.depth ?? 0);
        // each figure (the first, then siblings extruded together) is a sketch, and the figures drawn inside it are sketches that are cut out of it
        const made: { profile: string; holes: string[] }[] = [];
        let bad = "";
        figuresOf(st).forEach((fig, n) => {
          if (bad) return;
          const sk = profile(st, fig.outer, n ? `s_${st.id}_f${n}` : `s_${st.id}`);
          if (typeof sk === "string") { bad = sk; return; }
          const holes: string[] = [];
          fig.holes.forEach((h, i) => {
            const hs = profile(st, h, `s_${st.id}_f${n}h${i}`);
            if (typeof hs === "string") bad = hs; else { ops.push(hs); holes.push(hs.id); }
          });
          ops.push(sk);
          made.push({ profile: sk.id, holes });
        });
        if (bad) { errors[st.id] = bad; break; }
        const [first, ...more] = made;
        ops.push({ id: xid, type: "extrude", profile: first!.profile, ...(first!.holes.length ? { holes: first!.holes } : {}), ...(more.length ? { also: more } : {}), distance, ...(prev ? { target: prev } : {}), mode: prev ? "cutOrAdd" : "add" }); // (onto a body: a new piece while it only touches the body or stands apart, a cut as soon as it goes into it: `in_193`)
        prev = xid;
        break;
      }
      case "pushPull": {
        // push or pull a flat face of the body along its normal: out adds material, in cuts it (the same helper arrow as an extrude)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        if (p.cax !== undefined) {
          // a round face: its radius changes by the distance (the kernel knows whether it is a post or a hole)
          ops.push({ id: xid, type: "cylRadius", target: prev, ref: { axis: Number(p.cax), center: [Number(p.ccx), Number(p.ccy), Number(p.ccz)], radius: Number(p.cr), lo: Number(p.clo), hi: Number(p.chi), ...(p.cconvex !== undefined ? { convex: Number(p.cconvex) === 1 } : {}) }, delta: Number(p.depth ?? 0) });
          prev = xid;
          break;
        }
        if (p.nx !== undefined && p.px !== undefined) {
          // the face as it was when the step was made (later steps move the body's named faces, this one still means its own)
          ops.push({ id: xid, type: "faceExtrude", target: prev, ref: { n: [Number(p.nx), Number(p.ny), Number(p.nz)], d: Number(p.fd), point: [Number(p.px), Number(p.py), Number(p.pz)] }, distance: Number(p.depth ?? 0) });
          prev = xid;
          break;
        }
        const face = get(st.parts[0]!);
        const ref = face?.kind === "plane" ? decodeFace(face.ref) : null;
        if (!face || face.kind !== "plane" || !ref || !face.mesh || face.mesh.length < 9) { errors[st.id] = "the face is gone"; break; }
        const m = face.mesh;
        const point: Vec3 = [(m[0]! + m[3]! + m[6]!) / 3, (m[1]! + m[4]! + m[7]!) / 3, (m[2]! + m[5]! + m[8]!) / 3]; // a point on the face itself: the kernel finds it by plane and by this point
        ops.push({ id: xid, type: "faceExtrude", target: prev, ref: { n: ref.n, d: ref.d, point }, distance: Number(p.depth ?? 0) });
        prev = xid;
        break;
      }
      case "edgeMod": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const ranks = String(st.params.ranks ?? "").split(",");
        const sigs = String(st.params.sigs ?? "").split("|");
        const refs = st.parts.map((r, i) => { const e = decodeEdge(r); return e ? { ...e, ...(ranks[i] && ranks[i] !== "-" ? { rank: ranks[i] } : {}), ...(sigs[i] ? { sig: sigs[i] } : {}) } : e; });
        if (refs.some((r) => !r)) { errors[st.id] = "select lines of the body"; break; }
        const mode = String(st.params.mode ?? "fillet");
        const value = Number(st.params.value ?? 0);
        const last = ops[ops.length - 1];
        const continues: boolean = !!chain && last?.type === "edgeMod" && last.id === prev && chain.mode === mode;
        const here = { ref: refs, value };
        chain = continues ? { ...chain!, mods: [...chain!.mods, here] } : { base: prev, mode, mods: [here] };
        ops.push({ id: xid, type: "edgeMod", target: prev, ref: refs, mode, value, ...(chain.mods.length > 1 ? { together: { base: chain.base, mods: chain.mods } } : {}) });
        prev = xid;
        break;
      }
      case "pattern": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        const one = p.body ? { body: String(p.body) } : {}; // (one body of several is repeated, `in_271`)
        ops.push(p.mode === "circular"
          ? { id: xid, type: "pattern", target: prev, mode: "circular", count: Number(p.count), angle: Number(p.angle), axis: Number(p.axis), pivot: [Number(p.px), Number(p.py), Number(p.pz)], ...one }
          : { id: xid, type: "pattern", target: prev, mode: "linear", nx: Number(p.nx), ny: Number(p.ny), nz: Number(p.nz), dx: Number(p.dx), dy: Number(p.dy), dz: Number(p.dz), ...one });
        prev = xid;
        break;
      }
      case "move": case "rotate": case "scale": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const pivot = st.params.px !== undefined ? [Number(st.params.px), Number(st.params.py), Number(st.params.pz)] : undefined; // rotate about this point (default: the middle of the body)
        ops.push({ id: xid, type: "transform", target: prev, mode: st.type, axis: Number(st.params.axis ?? 0), value: Number(st.params.value ?? 0), ...(st.type === "move" && st.params.vx !== undefined ? { vec: [Number(st.params.vx), Number(st.params.vy), Number(st.params.vz)] } : {}), ...(pivot ? { pivot } : {}), ...(st.params.body ? { body: String(st.params.body) } : {}) });
        prev = xid;
        break;
      }
      case "combine": {
        // add or subtract bodies (`in_270`): the first body named stays; the bodies are named by the step that made each (`b/<name>/o`)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const names = st.parts.map((r) => (r.startsWith("b/") ? r.split("/")[1]! : ""));
        if (names.length < 2 || names.some((n) => !n || n === "body")) { errors[st.id] = "select two or more bodies"; break; }
        ops.push({ id: xid, type: "combine", target: prev, mode: String(st.params.mode ?? "add"), bodies: names, ...(Number(st.params.keep) === 1 ? { keep: 1 } : {}), ...(st.params.mode === "regions" ? { regions: String(st.params.regions ?? "").split(",").filter((x) => x !== "").map(Number), join: Number(st.params.join) === 1 } : {}) });
        prev = xid;
        break;
      }
      case "delete": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        ops.push({ id: xid, type: "clear" });
        prev = null;
        break;
      }
    }
  }
  return { graph: { params: {}, ops }, errors };
}
