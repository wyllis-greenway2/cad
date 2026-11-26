// Exchange and the derived mesh (E21, E70, E71; `dec_export_stl`, `dec_export_formats`, `dec_import`): the exact body is the model; the mesh is made from it for the screen, for picking by face id and for STL, and is
// never kept as the truth. STEP leaves and enters as the exact body (the kernel writes and reads it). All the answers are plain data (numbers, strings, bytes), so they cross the worker.
import { type EdgeRef, type Id, edgeKey, idKey, mint } from "./id.ts";
import * as K from "./kernel.ts";
import { Body, type Claim, fromClaims } from "./lineage.ts";
import { viewOf } from "./scope.ts";
import { type Value, kinds } from "./steps.ts";

export interface MeshSnap {
  positions: number[];
  normals: number[];
  indices: number[];
  /** the triangles of each face, by the face's id: `count` indices from `start`; `body` the name of the body it is in (a pick gives the face and the body) */
  faces: {
    id: string;
    /** the face's id as data (a step takes it to name the face) */ ref: Id;
    body: string | null;
    start: number;
    count: number;
  }[];
  /** the polylines of the edges (x y z per point), one per edge; `key` is the edge's name (the two faces beside it), null for an edge with none */
  lines: number[];
  edges: {
    key: string | null;
    /** the edge as data: the two faces beside it (a step takes it to name the edge) */ ref: EdgeRef | null;
    start: number;
    count: number;
  }[];
  /** the triangle count, for the person who wants to know what the mesh cost */ triangles: number;
}
/** the bodies of a scene that the names pick (by name or an alias); none named: all of them */
function pick(scene: Body, names?: readonly string[]): Body {
  if (!names?.length) return scene;
  const want = new Set(names),
    recs = scene.bodies.filter((b) => [b.id, ...b.alias].some((i) => want.has(idKey(i))));
  const missing = names.filter((n) => !scene.bodies.some((b) => [b.id, ...b.alias].some((i) => idKey(i) === n)));
  if (missing.length) throw new Error(`there is no body called ${missing.join(", ")}`);
  return viewOf(scene, recs);
}
/** the mesh of a body (or the named bodies) with its triangles grouped by face id; `tolerance` in mm is how far a triangle may lie from the surface */
export function meshOf(
  scene: Body,
  opts: { bodies?: readonly string[]; tolerance?: number; angle?: number } = {},
): MeshSnap {
  const b = pick(scene, opts.bodies);
  try {
    return K.scoped(() => {
      const m = K.mesh(b.solid, opts.tolerance, opts.angle),
        owner = new Map<string, string>();
      for (const r of scene.bodies) for (const f of r.faces) owner.set(idKey(f.id), idKey(r.id));
      const rec = (h: K.FaceH) => b.faces.find((f) => K.sameFace(f.h, h));
      const faces = m.faces.flatMap((g) => {
        const f = rec(g.face);
        return f
          ? [{ id: idKey(f.id), ref: f.id, body: owner.get(idKey(f.id)) ?? null, start: g.start, count: g.count }]
          : [];
      });
      const refs = new Map(b.edges().map((e) => [e.h, e.ref] as const)),
        edges = m.edges.map((g) => {
          const e = b.edges().find((x) => K.sameEdge(x.h, g.edge));
          return { key: e?.ref ? edgeKey(e.ref) : null, ref: e?.ref ?? null, start: g.start, count: g.count };
        });
      void refs;
      return {
        positions: m.positions,
        normals: m.normals,
        indices: m.indices,
        faces,
        lines: m.lines,
        edges,
        triangles: m.indices.length / 3,
      };
    });
  } finally {
    if (b !== scene) b.release?.();
  }
}

/** a binary STL from a mesh: 80 bytes of header, the triangle count, and per triangle its normal (from its own corners), three corners and two empty bytes */
export function stlBinary(m: Pick<MeshSnap, "positions" | "indices">, header = "cad"): Uint8Array {
  const n = m.indices.length / 3,
    buf = new ArrayBuffer(84 + 50 * n),
    dv = new DataView(buf);
  for (let i = 0; i < Math.min(80, header.length); i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + 50 * t,
      v = [0, 1, 2].map((k) => m.indices[3 * t + k]! * 3),
      P = (i: number) => [m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!] as const;
    const a = P(v[0]!),
      b = P(v[1]!),
      c = P(v[2]!),
      u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1]! * w[2]! - u[2]! * w[1]!,
      ny = u[2]! * w[0]! - u[0]! * w[2]!,
      nz = u[0]! * w[1]! - u[1]! * w[0]!,
      l = Math.hypot(nx, ny, nz) || 1;
    [nx / l, ny / l, nz / l, ...a, ...b, ...c].forEach((x, k) => dv.setFloat32(o + 4 * k, x, true));
  }
  return new Uint8Array(buf);
}
/** an ASCII STL, for people who want to read it */
export function stlAscii(m: Pick<MeshSnap, "positions" | "indices">, name = "cad"): string {
  const out = [`solid ${name}`];
  for (let t = 0; t < m.indices.length / 3; t++) {
    const v = [0, 1, 2].map((k) => m.indices[3 * t + k]! * 3),
      P = (i: number) => [m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!],
      a = P(v[0]!),
      b = P(v[1]!),
      c = P(v[2]!);
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!],
      w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!],
      nx = u[1]! * w[2]! - u[2]! * w[1]!,
      ny = u[2]! * w[0]! - u[0]! * w[2]!,
      nz = u[0]! * w[1]! - u[1]! * w[0]!,
      l = Math.hypot(nx, ny, nz) || 1;
    out.push(
      `facet normal ${nx / l} ${ny / l} ${nz / l}`,
      "outer loop",
      ...[a, b, c].map((p) => `vertex ${p[0]} ${p[1]} ${p[2]}`),
      "endloop",
      "endfacet",
    );
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}
/** the whole of a body, or the named bodies, as a file: `step` (exact) or `stl` (from the mesh; binary unless `ascii`) */
export function exportBody(
  scene: Body,
  format: "step" | "stl",
  opts: { bodies?: readonly string[]; tolerance?: number; angle?: number; ascii?: boolean } = {},
): Uint8Array {
  if (format === "step") {
    const b = pick(scene, opts.bodies);
    try {
      return K.scoped(() => K.stepBytes(b.solid));
    } finally {
      if (b !== scene) b.release?.();
    }
  }
  const m = meshOf(scene, opts);
  return opts.ascii ? new TextEncoder().encode(stlAscii(m)) : stlBinary(m);
}

// ---------------------------------------------------------------- bytes as text (plain data crosses the worker; a file inside a step's numbers is base64)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s +=
      B64[(n >> 18) & 63]! +
      B64[(n >> 12) & 63]! +
      (i + 1 < b.length ? B64[(n >> 6) & 63]! : "=") +
      (i + 2 < b.length ? B64[n & 63]! : "=");
  }
  return s;
}
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ""),
    out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3]
      .map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : 0))
      .reduce((a, c) => (a << 6) | c, 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---------------------------------------------------------------- import (E21): a body with no recipe before it; its faces take ids from the file's own order
/** a STEP file read as a body: `data` is the file's bytes in base64; each face is `face n` of this step, n the place in the file's own order, so later steps can refer to it */
kinds["import"] = {
  outputs: "body",
  run: (_in, { step }): Value => {
    const p = step.params as { format?: string; data?: string };
    if (p.format !== "step") throw new Error(`the format ${String(p.format)} is not read yet (STEP is)`);
    if (typeof p.data !== "string" || !p.data) throw new Error("this import has no file in it");
    const solids = K.stepSolids(fromBase64(p.data)),
      all = solids.length === 1 ? solids[0]! : K.compoundOf(solids),
      claims: Claim[] = all.faces().map((f, i) => ({ id: mint(step.id, "face", i) as Id, face: f }));
    return fromClaims(all, claims, step.id);
  },
};
