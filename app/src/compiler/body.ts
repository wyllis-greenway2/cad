// Parts of the body, derived from the kernel result (never saved): corners, lines and flat faces as ordinary parts with origin "body" (always references).
// Names carry the position (`dec_stable_references`, phase 2 builds the position form first): a part is found again after a rebuild if it is still where it was.
//   b/body/v@x,y,z                 a corner          b/body/e@ax,ay,az~bx,by,bz~mx,my,mz   a line (end, end, a point halfway)
//   b/body/f@nx,ny,nz,d            a flat face as a plane you can draw on (unit normal and offset n . p = d)
import type { Ref } from "../shared/ref.ts";
import { bodyRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { cross, normalize } from "../math/vec.ts";
import type { Part } from "../operation/part.ts";
import type { KernelResult } from "./kernel/adapter.ts";

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const key = (p: readonly number[]) => p.map((v) => String(r4(v) + 0)).join(",");

export const cornerName = (p: Vec3): Ref => bodyRef("body", `v@${key(p)}`);
export const edgeName = (a: Vec3, b: Vec3, m: Vec3): Ref => bodyRef("body", `e@${key(a)}~${key(b)}~${key(m)}`);
export const faceName = (n: Vec3, d: number): Ref => bodyRef("body", `f@${key([...n, d])}`);

const vec = (s: string): Vec3 => s.split(",").map(Number) as unknown as Vec3;

/** The kernel's reference for a line of the body, read from its name alone (so a step can find its lines again): { a, b, mid }. */
export function decodeEdge(r: Ref): { a: Vec3; b: Vec3; mid: Vec3 } | null {
  const m = /^b\/body\/e@([^~]+)~([^~]+)~([^~]+)$/.exec(r);
  return m ? { a: vec(m[1]!), b: vec(m[2]!), mid: vec(m[3]!) } : null;
}

export function bodyParts(result: KernelResult): Part[] {
  const out: Part[] = [];
  const base = { origin: "body" as const, plane: null, movable: false };
  const corners = new Set<string>();
  const corner = (p: Vec3) => {
    const ref = cornerName(p);
    if (!corners.has(ref)) {
      corners.add(ref);
      out.push({ ...base, ref, kind: "corner", at: p });
    }
    return ref;
  };
  for (const v of result.vertices ?? []) corner(v);
  for (const e of result.edges ?? []) {
    const straight = e.type === "LINE";
    out.push({ ...base, ref: edgeName(e.a, e.b, e.mid), kind: "line", a: corner(e.a), b: corner(e.b), ...(straight ? {} : { mid: e.mid }) });
  }
  for (const f of result.faces ?? []) {
    if (!f.n || f.d === undefined) continue; // full round faces come later
    const n = f.n as Vec3;
    const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = normalize(cross(helper, n));
    const v = cross(n, u);
    const mesh: number[] = [];
    const m = result.mesh;
    if (m) {
      // the triangles of this face (start and count are ranges into the index list)
      for (let i = f.start; i < f.start + f.count; i++) {
        const ix = m.triangles[i]!;
        mesh.push(m.vertices[ix * 3]!, m.vertices[ix * 3 + 1]!, m.vertices[ix * 3 + 2]!);
      }
    }
    out.push({ ...base, ref: faceName(n, f.d), kind: "plane", at: [n[0] * f.d, n[1] * f.d, n[2] * f.d], u, v, ...(mesh.length ? { mesh } : {}) });
  }
  return out;
}
