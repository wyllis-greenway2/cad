// The operation a tool for what is picked on a body opens (`dec_task_handles`): round and chamfer (the arrow out of the edge), push and pull (the arrow on the face, with the kinds the engine says the face has). The page gives the engine's facts; the descriptions are `interaction/operations.ts`.
import type { Selection } from "./bodyselect.ts";
import { flushPull, type PlaneRef } from "./engine/flush.ts";
import { idKey } from "./engine/id.ts";
import { edgeAnchor, faceCentre } from "./interaction/anchors.ts";
import type { Operation } from "./interaction/operation.ts";
import { pushOp, roundOp, type PullInfo } from "./interaction/operations.ts";
import type { createStudio } from "./studio.ts";
import { add, unit, type V3 } from "./vec.ts";

export interface BodyOpsHost {
  /** the flat faces of the scene, as planes (`engine/flush.ts`): what a pull can be flush with */
  planes(): PlaneRef[];
  studio: Pick<ReturnType<typeof createStudio>, "state" | "ask">;
  faceFacts(body: string, id: string): { ne: readonly number[]; ce: readonly number[] } | null;
}
export function createBodyOps(host: BodyOpsHost) {
  const { studio, faceFacts, planes } = host;
  return {
    /** the operation for `body:round`, `body:chamfer` or `body:pull` on what is picked (null: it has none) */
    async operationFor(id: string, sel: Selection): Promise<Operation | null> {
      const mesh = studio.state().meshes.find((x) => x.id === sel.body),
        f = sel.faces[0];
      if ((id === "body:round" || id === "body:chamfer") && sel.edges.length && mesh) {
        // the number is the size: about a tenth of the shortest edge, to type over
        const len = (e: { start: number; count: number }) => {
          let L = 0;
          for (let i = 0; i + 1 < e.count; i++) {
            const k = 3 * (e.start + i);
            L += Math.hypot(
              mesh.lines[k + 3]! - mesh.lines[k]!,
              mesh.lines[k + 4]! - mesh.lines[k + 1]!,
              mesh.lines[k + 5]! - mesh.lines[k + 2]!,
            );
          }
          return L;
        };
        const short = Math.min(...sel.edges.map(len)),
          size = Math.max(0.1, Math.round(Math.min(short / 10, 2) * 10) / 10);
        // the arrow stands on the first edge (a quarter of the way along a straight one, in the middle of a curve) and points out of the body, between its two faces (pulled out: round; pushed in: chamfer)
        const e0 = sel.edges[0]!,
          at = edgeAnchor(mesh.lines, e0);
        const ns = [e0.ref.a, e0.ref.b].map((r) => {
          const fi = mesh.faces.find((x) => idKey(x.ref) === idKey(r));
          return fi && faceFacts(sel.body, fi.id)?.ne;
        });
        const sum = ns[0] && ns[1] ? add(ns[0] as unknown as V3, ns[1] as unknown as V3) : null,
          normal = sum && Math.hypot(...sum) > 1e-6 ? unit(sum) : null;
        return roundOp(
          {
            body: sel.body,
            edges: sel.edges.map((e) => e.ref),
            kind: id === "body:chamfer" ? "chamfer" : "fillet",
            at: normal ? at : sel.at,
            normal,
          },
          size,
        );
      }
      if (id === "body:pull" && mesh && f) {
        const ff = faceFacts(sel.body, f.id);
        if (!ff) return null;
        const positions = new Float32Array(f.count * 3);
        for (let k = 0; k < f.count; k++)
          positions.set(
            mesh.positions.subarray(3 * mesh.indices[f.start + k]!, 3 * mesh.indices[f.start + k]! + 3),
            3 * k,
          );
        const r = await studio.ask({ what: "pullModes", step: sel.body, face: f.ref }); // the kinds of pull this face has, from the worker
        const kinds = r.ok ? (r.data as PullInfo[]) : [{ mode: "push" as const, ok: true, why: "", suggested: true }];
        const at = faceCentre(mesh, f), // (the arrow stands in the middle of the face)
          normal = ff.ne as unknown as V3,
          snap = (d: number, reach: number) => {
            const r = flushPull({ p: at, n: normal }, planes(), d, reach);
            return r && { d: r.d, tie: r.to.face };
          };
        return pushOp({ ref: f.ref, body: sel.body, at, normal, positions, kinds, snap });
      }
      return null;
    },
  };
}
