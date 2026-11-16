// The part snapshot builder (`in_569`, `dec_manufacturing_contract` points 6 and 8, `inv_manufacturing_boundary`): the translator between the app and the manufacturing contract. It is the one place that knows the scene and the kernel's
// result and turns them into the plain data a route is given, so a route never sees either and a new kernel or a mesh-based part changes this file and nothing in `manufacturing/`.
// Today: a flat drawing (a sketch, or a flat face of a body) with its lines' layers. A solid body (mesh, STEP, material) is the next piece, written when a route that takes a solid is.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { CONTRACT_VERSION } from "../manufacturing/index.ts";
import type { PartSnapshot, FlatPiece, Point3 } from "../manufacturing/index.ts";
import { normalOfPlane } from "../operation/part.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
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
