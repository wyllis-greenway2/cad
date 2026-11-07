// Parts of the body, derived from the kernel result (never saved): corners, lines and flat faces as ordinary parts with origin "body" (always references).
// Names carry the position (`dec_stable_references`, phase 2 builds the position form first): a part is found again after a rebuild if it is still where it was.
//   b/body/v@x,y,z                 a corner          b/body/e@ax,ay,az~bx,by,bz~mx,my,mz   a line (end, end, a point halfway)
//   b/body/f@nx,ny,nz,d            a flat face as a plane you can draw on (unit normal and offset n . p = d)
import type { Ref } from "../shared/ref.ts";
import { bodyRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { cross, normalize } from "../math/vec.ts";
import type { Part } from "../operation/part.ts";
import type { KernelResult, KernelEdge } from "./kernel/adapter.ts";

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const key = (p: readonly number[]) => p.map((v) => String(r4(v) + 0)).join(",");

/** The whole body as one part (a single body for now). */
export const BODY_OBJECT: Ref = bodyRef("body", "o");
export const cornerName = (p: Vec3): Ref => bodyRef("body", `v@${key(p)}`);
const edgeName = (a: Vec3, b: Vec3, m: Vec3): Ref => bodyRef("body", `e@${key(a)}~${key(b)}~${key(m)}`);
const cylName = (c: { axis: number; center: Vec3; radius: number; lo: number; hi: number }): Ref => bodyRef("body", `c@${key([c.axis, ...c.center, c.radius, c.lo, c.hi])}`);
export const faceName = (n: Vec3, d: number, at?: Vec3): Ref => bodyRef("body", `f@${key([...n, d])}${at ? `~${key(at)}` : ""}`);

const vec = (s: string): Vec3 => s.split(",").map(Number) as unknown as Vec3;

/** The kernel's reference for a line of the body, read from its name alone (so a step can find its lines again): { a, b, mid }. */
export function decodeEdge(r: Ref): { a: Vec3; b: Vec3; mid: Vec3; rank?: string; sig?: string } | null {
  const m = /^b\/body\/e@([^~]+)~([^~]+)~([^~]+)$/.exec(r);
  return m ? { a: vec(m[1]!), b: vec(m[2]!), mid: vec(m[3]!) } : null;
}

/** The unit normal and offset of a flat face of the body, read from its name alone. */
export function decodeFace(r: Ref): { n: Vec3; d: number } | null {
  const m = /^b\/body\/f@([^,]+),([^,]+),([^,]+),([^~]+)(?:~.*)?$/.exec(r);
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], d: Number(m[4]) } : null;
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
  if (result.mesh) out.push({ ...base, ref: BODY_OBJECT, kind: "body" }); // the whole object: selected by the third click
  for (const v of result.vertices ?? []) corner(v);
  // a rim that the kernel made of two half circles: each half knows the other, so picking one picks both
  const halves = new Map<string, Ref[]>();
  const circleKey = (c: NonNullable<KernelEdge["circle"]>) => `${c.center.map((v) => Math.round(v * 100)).join(",")}|${Math.round(c.radius * 100)}|${c.normal.map((v) => Math.abs(Math.round(v * 100))).join(",")}`;
  for (const e of result.edges ?? []) if (e.circle && e.a.some((v, i) => v !== e.b[i])) halves.set(circleKey(e.circle), [...(halves.get(circleKey(e.circle)) ?? []), edgeName(e.a, e.b, e.mid)]);
  for (const e of result.edges ?? []) {
    const straight = e.type === "LINE";
    const name = edgeName(e.a, e.b, e.mid);
    const pair = e.circle ? halves.get(circleKey(e.circle)) : undefined;
    const twin = pair && pair.length === 2 ? pair.find((r) => r !== name) : undefined;
    out.push({ ...base, ref: name, kind: "line", a: corner(e.a), b: corner(e.b), ...(straight ? {} : { mid: e.mid }), ...(e.circle ? { circle: e.circle as { center: Vec3; normal: Vec3; radius: number } } : {}), ...(twin ? { twin } : {}) });
  }
  const flats: { n: Vec3; d: number; u: Vec3; v: Vec3; mesh: number[] }[] = [];
  for (const f of result.faces ?? []) {
    if (f.type === "cyl") {
      // a full round face along a world axis: a part you can select and push / pull (its radius changes)
      const axis = f.axis as 0 | 1 | 2;
      const center = (f.center as Vec3).map((v, i) => (i === axis ? (f.lo as number) : v)) as unknown as Vec3;
      const e = [0, 1, 2].filter((i) => i !== axis);
      const dirs = e.map((i) => [0, 0, 0].map((_, k) => (k === i ? 1 : 0)) as unknown as Vec3);
      const mesh: number[] = [];
      const m = result.mesh;
      if (m) for (const r of (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }]) for (let i = r.start; i < r.start + r.count; i++) { const ix = m.triangles[i]!; mesh.push(m.vertices[ix * 3]!, m.vertices[ix * 3 + 1]!, m.vertices[ix * 3 + 2]!); }
      const curved = { axis, center, radius: f.radius as number, lo: f.lo as number, hi: f.hi as number, convex: f.convex !== false };
      out.push({ ...base, ref: cylName(curved), kind: "plane", at: center, u: dirs[0]!, v: dirs[1]!, curved, ...(mesh.length ? { mesh } : {}) });
      continue;
    }
    if (f.type === "surf") {
      // any other curved face (a cone, a sphere, a fillet, a turned post): a part to select and look at, named by its surface and where it lies
      const lo = f.lo as Vec3;
      const hi = f.hi as Vec3;
      const mesh: number[] = [];
      const m = result.mesh;
      if (m) for (let i = f.start; i < f.start + f.count; i++) { const ix = m.triangles[i]!; mesh.push(m.vertices[ix * 3]!, m.vertices[ix * 3 + 1]!, m.vertices[ix * 3 + 2]!); }
      const mid: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      out.push({ ...base, ref: bodyRef("body", `s@${String(f.surface)},${key([...lo, ...hi])}`), kind: "plane", at: mid, u: [1, 0, 0], v: [0, 1, 0], rounded: String(f.surface), ...(typeof f.radius === "number" ? { radius: f.radius } : {}), ...(f.axisOf ? { round: f.axisOf as { axis: 0 | 1 | 2; center: Vec3; convex: boolean } } : {}), ...(mesh.length ? { mesh } : {}) });
      continue;
    }
    if (!f.n || f.d === undefined) continue;
    const n = f.n as Vec3;
    // the plane's first axis: along the world X on floors and ceilings, along the world Z-cross-normal on walls (so a face reads like the world plane it is parallel to)
    const u: Vec3 = Math.abs(n[2]) > 0.9 ? normalize([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]) : normalize(cross([0, 0, 1], n));
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
    flats.push({ n, d: f.d, u, v, mesh });
  }
  // two separate faces in one plane (a block's end cut in two by a hole) must not share a name, or one hides the other: the ones that share are named by where they are as well
  const same = new Map<string, number>();
  for (const f of flats) same.set(faceName(f.n, f.d), (same.get(faceName(f.n, f.d)) ?? 0) + 1);
  for (const f of flats) {
    let ref = faceName(f.n, f.d);
    if ((same.get(ref) ?? 0) > 1 && f.mesh.length) {
      const k = f.mesh.length / 3;
      let [x, y, z] = [0, 0, 0];
      for (let i = 0; i < f.mesh.length; i += 3) { x += f.mesh[i]!; y += f.mesh[i + 1]!; z += f.mesh[i + 2]!; }
      ref = faceName(f.n, f.d, [x / k, y / k, z / k]);
    }
    out.push({ ...base, ref, kind: "plane", at: [f.n[0] * f.d, f.n[1] * f.d, f.n[2] * f.d], u: f.u, v: f.v, ...(f.mesh.length ? { mesh: f.mesh } : {}) });
  }
  return out;
}
