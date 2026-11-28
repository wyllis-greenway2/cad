// The operation a tool for what is picked on a body opens (`dec_task_handles`): round and chamfer (the arrow out of the edge), push and pull (the arrow on the face, with the kinds the engine says the face has). The page gives the engine's facts; the descriptions are `interaction/operations.ts`.
import type { Selection } from "./bodyselect.ts";
import { flushPull, type PlaneRef } from "./engine/flush.ts";
import { idKey } from "./engine/id.ts";
import { edgeAnchor, faceAnchor, nearestOnEdges, normalAt } from "./interaction/anchors.ts";
import { edgesAround } from "./interaction/pick.ts";
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
/** the triangles of a face (x y z each) */
function facePositions(
  mesh: { positions: ArrayLike<number>; indices: ArrayLike<number> },
  f: { start: number; count: number },
) {
  const out = new Float32Array(f.count * 3);
  for (let k = 0; k < f.count; k++)
    for (let c = 0; c < 3; c++) out[3 * k + c] = mesh.positions[3 * mesh.indices[f.start + k]! + c]!;
  return out;
}
export function createBodyOps(host: BodyOpsHost) {
  const { studio, faceFacts, planes } = host;
  return {
    /** the operation for `body:round`, `body:chamfer` or `body:pull` on what is picked (null: it has none) */
    async operationFor(id: string, sel: Selection): Promise<Operation | null> {
      const mesh = studio.state().meshes.find((x) => x.id === sel.body),
        f = sel.faces[0];
      // the edges picked, or the edges of the faces picked (a face stands for its edges)
      const edges = sel.edges.length ? sel.edges : mesh ? edgesAround(mesh, sel.faces) : [];
      if ((id === "body:round" || id === "body:chamfer") && edges.length && mesh) {
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
        const short = Math.min(...edges.map(len)),
          size = Math.max(0.1, Math.round(Math.min(short / 10, 2) * 10) / 10);
        // the arrow stands on the edge where it was clicked (of a face's edges, the one nearest the click; of edges picked another way, the first, a quarter of the way along a straight one) and points out of the body, between its two faces (pulled out: round; pushed in: chamfer)
        const near = nearestOnEdges(mesh.lines, edges, sel.at),
          e0 = near?.edge ?? edges[0]!,
          at = near?.at ?? edgeAnchor(mesh.lines, e0);
        const ns = [e0.ref.a, e0.ref.b].map((r) => {
          const fi = mesh.faces.find((x) => idKey(x.ref) === idKey(r));
          return fi && faceFacts(sel.body, fi.id)?.ne;
        });
        const sum = ns[0] && ns[1] ? add(ns[0] as unknown as V3, ns[1] as unknown as V3) : null,
          normal = sum && Math.hypot(...sum) > 1e-6 ? unit(sum) : null;
        return roundOp(
          {
            body: sel.body,
            edges: edges.map((e) => e.ref),
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
        const positions = facePositions(mesh, f);
        const r = await studio.ask({ what: "pullModes", step: sel.body, face: f.ref }); // the kinds of pull this face has, from the worker
        const kinds = r.ok ? (r.data as PullInfo[]) : [{ mode: "push" as const, ok: true, why: "", suggested: true }];
        const at = faceAnchor(mesh, f, sel.at), // (the arrow stands on the face where it was clicked)
          nm = normalAt(mesh, f, at),
          ne = ff.ne as unknown as V3,
          normal = nm[0] * ne[0] + nm[1] * ne[1] + nm[2] * ne[2] > 0.9999 ? ne : nm, // (a flat face's own normal; a curved face's, where the arrow stands)
          snap = (d: number, reach: number) => {
            const r = flushPull({ p: at, n: normal }, planes(), d, reach);
            return r && { d: r.d, tie: r.to.face };
          };
        // more faces picked: they go with it, each along its own normal
        const more = sel.faces.slice(1).flatMap((g) => {
          const gf = faceFacts(sel.body, g.id);
          return gf ? [{ ref: g.ref, normal: gf.ne as unknown as V3, positions: facePositions(mesh, g) }] : [];
        });
        // a round wall: its diameter is the number (the wall's own radius, and which way a pull goes, from the engine's cylinder)
        const cyl = kinds.find((k) => k.mode === "offset")?.cylinder,
          wall = (() => {
            if (!cyl) return undefined;
            const w = [at[0] - cyl.point[0]!, at[1] - cyl.point[1]!, at[2] - cyl.point[2]!],
              al = w[0]! * cyl.dir[0]! + w[1]! * cyl.dir[1]! + w[2]! * cyl.dir[2]!,
              radial = [w[0]! - cyl.dir[0]! * al, w[1]! - cyl.dir[1]! * al, w[2]! - cyl.dir[2]! * al];
            return { r: cyl.r, grows: radial[0]! * normal[0] + radial[1]! * normal[1] + radial[2]! * normal[2] > 0 };
          })();
        return pushOp({
          ref: f.ref,
          body: sel.body,
          at,
          normal,
          positions,
          kinds,
          snap,
          ...(more.length ? { more } : {}),
          ...(wall ? { wall } : {}),
        });
      }
      return null;
    },
  };
}
