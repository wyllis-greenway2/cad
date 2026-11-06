// The scene as an operation graph for the kernel (`dec_clean_engine_design` section 7): steps in order, closed loops of lines (or a circle) as the profiles.
// Pure: no kernel, no browser. A step that cannot be built is reported with the reason, and the steps after it that need it are skipped by the kernel.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize, sub } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, loopPoints } from "../operation/part.ts";
import type { KernelGraph, KernelOp } from "./kernel/adapter.ts";
import { decodeEdge, decodeFace } from "./body.ts";
import { loopOf } from "../operation/loops.ts";
export { loopOf };

export interface GraphResult { graph: KernelGraph; errors: Record<string, string> }

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const frameOf = (pl: Plane) => ({ origin: [...pl.at], xDir: [...normalize(pl.u)], normal: [...normalOfPlane(pl)] });
const to2d = (pl: Plane, p: Vec3): [number, number] => {
  const d = sub(p, pl.at);
  return [r6(d[0] * pl.u[0] + d[1] * pl.u[1] + d[2] * pl.u[2]), r6(d[0] * pl.v[0] + d[1] * pl.v[1] + d[2] * pl.v[2])];
};

export function buildGraph(scene: Scene): GraphResult {
  const get = lookup(scene);
  const ops: KernelOp[] = [];
  const errors: Record<string, string> = {};
  let prev: string | null = null;
  // consecutive fillets (or chamfers) of one kind: the body before the first of them and all of them so far, so that a fillet that cannot be made on its own (next to ones already made) can be tried together with them
  let chain: { base: string | null; mode: string; mods: { ref: unknown; value: number }[] } | null = null;

  const profile = (st: Step): KernelOp | string => {
    const first = get(st.parts[0]!);
    if (!first) return "a part of this step is gone";
    const plane = first.plane ? get(first.plane) : undefined;
    if (!plane || plane.kind !== "plane") return "the shape is not on a plane";
    const id = `s_${st.id}`;
    if (first.kind === "circle") {
      const c = pointOf(get, first.center);
      if (!c) return "the circle's centre is gone";
      return { id, type: "sketch", shape: "circle", radius: r6(first.radius), at: to2d(plane, c), plane: "XY", origin: 0, frame: frameOf(plane) };
    }
    const loop = loopOf(get, st.parts);
    if (!loop.ok) return loop.error;
    if (loop.corners.some((c) => !pointOf(get, c))) return "a corner of the shape is gone";
    const pts = loopPoints(get, st.parts, loop.corners); // (the points of any arcs between the corners are in it)
    return { id, type: "sketch", shape: "polygon", points: pts.map((p) => to2d(plane, p)), plane: "XY", origin: 0, frame: frameOf(plane) };
  };

  for (const st of scene.steps) {
    const xid = `x_${st.id}`;
    switch (st.type) {
      case "extrude": {
        const sk = profile(st);
        if (typeof sk === "string") { errors[st.id] = sk; break; }
        const distance = Number(st.params.depth ?? 0);
        ops.push(sk, { id: xid, type: "extrude", profile: sk.id, distance, ...(prev ? { target: prev } : {}), mode: distance < 0 && prev ? "cutOrAdd" : "add" }); // (pulled backwards onto a body: a pocket if it meets the body, else a new piece)
        prev = xid;
        break;
      }
      case "pushPull": {
        // push or pull a flat face of the body along its normal: out adds material, in cuts it (the same helper arrow as an extrude)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        if (p.cax !== undefined) {
          // a round face: its radius changes by the distance (the kernel knows whether it is a post or a hole)
          ops.push({ id: xid, type: "cylRadius", target: prev, ref: { axis: Number(p.cax), center: [Number(p.ccx), Number(p.ccy), Number(p.ccz)], radius: Number(p.cr), lo: Number(p.clo), hi: Number(p.chi) }, delta: Number(p.depth ?? 0) });
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
        const refs = st.parts.map((r) => decodeEdge(r));
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
        ops.push(p.mode === "circular"
          ? { id: xid, type: "pattern", target: prev, mode: "circular", count: Number(p.count), angle: Number(p.angle), axis: Number(p.axis), pivot: [Number(p.px), Number(p.py), Number(p.pz)] }
          : { id: xid, type: "pattern", target: prev, mode: "linear", nx: Number(p.nx), ny: Number(p.ny), nz: Number(p.nz), dx: Number(p.dx), dy: Number(p.dy), dz: Number(p.dz) });
        prev = xid;
        break;
      }
      case "move": case "rotate": case "scale": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const pivot = st.params.px !== undefined ? [Number(st.params.px), Number(st.params.py), Number(st.params.pz)] : undefined; // rotate about this point (default: the middle of the body)
        ops.push({ id: xid, type: "transform", target: prev, mode: st.type, axis: Number(st.params.axis ?? 0), value: Number(st.params.value ?? 0), ...(pivot ? { pivot } : {}) });
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
