// The part snapshot builder (`in_569`, `dec_manufacturing_contract` points 6 and 8, `inv_manufacturing_boundary`): the translator between the app and the manufacturing contract. It is the one place that knows the scene and the kernel's
// result and turns them into the plain data a route is given, so a route never sees either and a new kernel or a mesh-based part changes this file and nothing in `manufacturing/`.
// A flat drawing (a sketch, or a flat face of a body) with its lines' layers (`flatSnapshot`), and a solid body with its mesh, optionally its exact solid as STEP, and its material tag (`solidSnapshot`). Both are plain data: nothing the kernel or
// the scene made crosses (`inv_manufacturing_boundary`).
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { CONTRACT_VERSION } from "../manufacturing/index.ts";
import type { PartSnapshot, FlatPiece, Point3 } from "../manufacturing/index.ts";
import { normalOfPlane } from "../operation/part.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import type { Kernel } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";
import { EXPORT_QUALITY } from "./exportstl.ts";
import { bodyLabel } from "./panels.ts";
import type { Session } from "./session.ts";
import { sketchPieces } from "./exportsketch.ts";
import { boundsOf } from "../compiler/flatfile.ts";
import type { Piece } from "../compiler/flatfile.ts";

const flatPiece = (p: Piece): FlatPiece => {
  const layer = p.layer ? { layer: p.layer } : {};
  return p.k === "seg" ? { kind: "line", p: p.p, q: p.q, ...layer } : p.k === "circle" ? { kind: "circle", center: p.c, radius: p.r, ...layer } : { kind: "arc", center: p.c, radius: p.r, p: p.p, q: p.q, ccw: p.ccw, ...layer };
};

/** The flat drawing the selection stands for (or all that is drawn, with nothing selected), as a part for the manufacturing routes; or why there is none. */
export function flatSnapshot(session: Session): Result<PartSnapshot> {
  const r = sketchPieces(sceneOf(session), selectionOf(session));
  if (!r.ok) return err(r.error);
  const pl = r.plane;
  const frame = { origin: pl.at as Point3, xDir: pl.u as Point3, normal: normalOfPlane(pl) as Point3 };
  const b = boundsOf(r.pieces);
  const y = [frame.normal[1] * frame.xDir[2] - frame.normal[2] * frame.xDir[1], frame.normal[2] * frame.xDir[0] - frame.normal[0] * frame.xDir[2], frame.normal[0] * frame.xDir[1] - frame.normal[1] * frame.xDir[0]] as const;
  const world = (u: number, v: number): Point3 => [0, 1, 2].map((i) => frame.origin[i]! + u * frame.xDir[i]! + v * y[i]!) as unknown as Point3;
  const corners = b ? [world(b.min[0], b.min[1]), world(b.max[0], b.min[1]), world(b.max[0], b.max[1]), world(b.min[0], b.max[1])] : [frame.origin];
  const bbox = { min: [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))) as unknown as Point3, max: [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!))) as unknown as Point3 };
  return ok({ contract: CONTRACT_VERSION, id: `sketch/${pl.ref}`, name: "Drawing", kind: "flat", units: "mm", outlines: [{ plane: frame, pieces: r.pieces.map(flatPiece) }], bbox });
}

/** Smooth normals for a triangle mesh: at each vertex the average of the normals of the triangles that meet there, weighted by their area; unit length, or straight up for a vertex no triangle has. */
export function normalsOf(vertices: Float32Array, triangles: Uint32Array): Float32Array {
  const n = new Float32Array(vertices.length);
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t]! * 3, triangles[t + 1]! * 3, triangles[t + 2]! * 3];
    const [ux, uy, uz] = [vertices[b]! - vertices[a]!, vertices[b + 1]! - vertices[a + 1]!, vertices[b + 2]! - vertices[a + 2]!];
    const [vx, vy, vz] = [vertices[c]! - vertices[a]!, vertices[c + 1]! - vertices[a + 1]!, vertices[c + 2]! - vertices[a + 2]!];
    const [x, y, z] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; // (its length is twice the triangle's area: the weight)
    for (const i of [a, b, c]) { n[i]! += x; n[i + 1]! += y; n[i + 2]! += z; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!);
    if (l > 0) { n[i] = n[i]! / l; n[i + 1] = n[i + 1]! / l; n[i + 2] = n[i + 2]! / l; } else n[i + 2] = 1;
  }
  return n;
}

/**
 * A solid body as a part for the manufacturing routes: the kernel's fine mesh of that body (as for an STL file), its box, the name it keeps through the history, its label in the Bodies list, and its material tag (`in_565`);
 * with `step` also the exact solid as STEP text, for a route that needs more than a mesh. The kernel may work on its own thread, so this answers later.
 */
export async function solidSnapshot(session: Session, kernel: Kernel, bodyId: string, opts: { step?: boolean } = {}): Promise<Result<PartSnapshot>> {
  const sc = sceneOf(session);
  const body = Object.values(sc.parts).find((p) => p.kind === "body" && p.id === bodyId);
  if (!body) return err("that body is not there any more");
  const graph = graphOf(sc);
  const m = await kernel.exportMesh(graph, { ...EXPORT_QUALITY, bodies: [bodyId] });
  if (!m.ok) return err(m.error);
  if (!m.triangles.length) return err("nothing is left of that body");
  let step: string | undefined;
  if (opts.step) {
    const r = await kernel.exportStep(graph, [bodyId]);
    if (!r.ok) return err(r.error);
    step = new TextDecoder().decode(r.bytes);
  }
  const material = sc.materials?.[bodyId];
  return ok({
    contract: CONTRACT_VERSION, id: bodyId, name: bodyLabel(sc, body.ref), kind: "solid", units: "mm",
    mesh: { vertices: m.vertices, normals: normalsOf(m.vertices, m.triangles), triangles: m.triangles },
    ...(step ? { step } : {}), ...(material ? { material } : {}),
    bbox: { min: [...m.bbox.min] as unknown as Point3, max: [...m.bbox.max] as unknown as Point3 },
  });
}

/** The solid bodies of the model (or only those named, by the name they keep) as parts, in the order of the Bodies list; or why one could not be made. */
export async function solidSnapshots(session: Session, kernel: Kernel, only?: readonly string[], opts: { step?: boolean } = {}): Promise<Result<PartSnapshot[]>> {
  const ids = Object.values(sceneOf(session).parts).flatMap((p) => (p.kind === "body" && p.id && (!only || only.includes(p.id)) ? [p.id] : []));
  if (!ids.length) return err("nothing to make: there is no body");
  const out: PartSnapshot[] = [];
  for (const id of ids) { const r = await solidSnapshot(session, kernel, id, opts); if (!r.ok) return r; out.push(r.value); }
  return ok(out);
}
