// The scene as an operation graph for the kernel (`dec_clean_engine_design` section 7): steps in order, closed loops of lines (or a circle) as the profiles.
// Pure: no kernel, no browser. A step that cannot be built is reported with the reason, and the steps after it that need it are skipped by the kernel.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize, sub } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf } from "../operation/part.ts";
import type { KernelGraph, KernelOp } from "./kernel/adapter.ts";
import { decodeEdge } from "./body.ts";
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
    const pts = loop.corners.map((c) => pointOf(get, c));
    if (pts.some((p) => !p)) return "a corner of the shape is gone";
    return { id, type: "sketch", shape: "polygon", points: pts.map((p) => to2d(plane, p!)), plane: "XY", origin: 0, frame: frameOf(plane) };
  };

  for (const st of scene.steps) {
    const xid = `x_${st.id}`;
    switch (st.type) {
      case "extrude": {
        const sk = profile(st);
        if (typeof sk === "string") { errors[st.id] = sk; break; }
        const distance = Number(st.params.depth ?? 0);
        ops.push(sk, { id: xid, type: "extrude", profile: sk.id, distance, ...(prev ? { target: prev } : {}), mode: distance < 0 && prev ? "cut" : "add" });
        prev = xid;
        break;
      }
      case "edgeMod": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const refs = st.parts.map((r) => decodeEdge(r));
        if (refs.some((r) => !r)) { errors[st.id] = "select lines of the body"; break; }
        ops.push({ id: xid, type: "edgeMod", target: prev, ref: refs, mode: String(st.params.mode ?? "fillet"), value: Number(st.params.value ?? 0) });
        prev = xid;
        break;
      }
      case "move": case "rotate": case "scale": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        ops.push({ id: xid, type: "transform", target: prev, mode: st.type, axis: Number(st.params.axis ?? 0), value: Number(st.params.value ?? 0) });
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
