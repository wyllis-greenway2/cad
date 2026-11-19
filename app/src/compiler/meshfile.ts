// Reading triangle meshes (`dec_import_mesh`): STL (binary and text) and 3MF (a zip of XML, with units, objects, components and transforms), and making them ready to be a solid: corners at the same place joined, a mesh that is not closed
// refused with what is wrong, triangles that run the wrong way turned, separate shells told apart. Pure bytes in, meshes out.
import type { MeshData } from "./kernel/occt/meshdata.mjs";

export type Mesh = MeshData;
export type Parsed<T> = { ok: true; value: T; notes: string[] } | { ok: false; error: string };
/** The most triangles an imported mesh may have: each becomes a face of an exact solid for a while, at about a millisecond each. */
export const MAX_MESH_TRIANGLES = 12000;
const tooMany = (n: number): string => `this mesh has ${n.toLocaleString("en-US")} triangles: the app imports up to ${MAX_MESH_TRIANGLES.toLocaleString("en-US")} (each becomes a face of an exact solid). Reduce it first in a mesh program (Decimate in Blender, Simplify in MeshLab or PrusaSlicer) and import that`;

// ---------- STL ----------
/** The corners (nine numbers for each triangle) of a binary or text STL. */
export function parseStl(bytes: Uint8Array): Parsed<Float64Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 5)));
  const binarySize = bytes.length >= 84 ? 84 + view.getUint32(80, true) * 50 : -1;
  if (bytes.length === binarySize || (binarySize > 0 && !/^solid/i.test(head))) {
    const n = view.getUint32(80, true);
    if (bytes.length < 84 + n * 50) return { ok: false, error: "this STL file is cut short (fewer triangles than its header says)" };
    if (n > MAX_MESH_TRIANGLES) return { ok: false, error: tooMany(n) };
    const out = new Float64Array(n * 9);
    for (let t = 0, at = 84; t < n; t++, at += 50) for (let k = 0; k < 9; k++) out[t * 9 + k] = view.getFloat32(at + 12 + 4 * k, true);
    return n ? { ok: true, value: out, notes: [] } : { ok: false, error: "this STL file has no triangles" };
  }
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid/i.test(text)) return { ok: false, error: "this is not an STL file" };
  const nums: number[] = [];
  for (const m of text.matchAll(/vertex\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g)) {
    nums.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (nums.length / 9 > MAX_MESH_TRIANGLES) return { ok: false, error: tooMany(Math.floor((text.match(/facet\s+normal/g) ?? []).length)) };
  }
  if (!nums.length || nums.length % 9) return { ok: false, error: "this STL file has no triangles (or one with fewer than three corners)" };
  return { ok: true, value: Float64Array.from(nums), notes: [] };
}

// ---------- zip (for 3MF) ----------
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** The files of a zip by name (stored or deflated; not zip64). */
export async function unzip(bytes: Uint8Array): Promise<Parsed<Map<string, Uint8Array>>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) return { ok: false, error: "this is not a 3MF file (it is not a zip)" };
  const [count, dirAt] = [v.getUint16(end + 10, true), v.getUint32(end + 16, true)];
  if (count === 0xffff || dirAt === 0xffffffff) return { ok: false, error: "this zip is too large (zip64): it is not a plain 3MF" };
  const files = new Map<string, Uint8Array>();
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) return { ok: false, error: "this 3MF file is damaged (its list of files is)" };
    const [method, size, packed, nameLen, extraLen, commentLen, local] = [v.getUint16(at + 10, true), v.getUint32(at + 24, true), v.getUint32(at + 20, true), v.getUint16(at + 28, true), v.getUint16(at + 30, true), v.getUint16(at + 32, true), v.getUint32(at + 42, true)];
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + packed);
    try { files.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array(0)); } catch { return { ok: false, error: `this 3MF file is damaged (${name} cannot be unpacked)` }; }
    if (method !== 0 && method !== 8) return { ok: false, error: `this 3MF file uses a way of packing (${method}) that is not known` };
    if (files.get(name)!.length !== size && method === 0) return { ok: false, error: "this 3MF file is damaged (a file is the wrong size)" };
  }
  return { ok: true, value: files, notes: [] };
}

// ---------- 3MF ----------
type M12 = number[]; // a 3MF transform: 12 numbers, the rows of a 3 x 3 and then the move; a point is a row: [x y z 1] x M
const IDENTITY: M12 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const compose = (a: M12, b: M12): M12 => { // first a, then b
  const out: M12 = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!);
  for (let c = 0; c < 3; c++) out.push(a[9]! * b[c]! + a[10]! * b[3 + c]! + a[11]! * b[6 + c]! + b[9 + c]!);
  return out;
};
const det3 = (m: M12): number => m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
const UNITS: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const attrsOf = (s: string): Record<string, string> => { const o: Record<string, string> = {}; for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o[m[1]!.replace(/^[\w]+:/, "")] = m[2] ?? m[3] ?? ""; return o; };
const tagsOf = (xml: string) => [...xml.matchAll(/<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)].map((m) => ({ closing: m[1] === "/", name: m[2]!.replace(/^[\w]+:/, ""), attrs: attrsOf(m[3] ?? ""), selfClose: m[4] === "/" }));
const matrixOf = (t: string | undefined): M12 => { const a = (t ?? "").trim().split(/\s+/).map(Number); return a.length === 12 && a.every(Number.isFinite) ? a : IDENTITY; };

interface Obj { type: string; name: string; mesh: { v: number[]; t: number[] } | null; components: { id: string; path: string | null; m: M12 }[] }
/** Parse one model file: its unit, its objects (with meshes or components) and its build items. */
function parseModel(xml: string): { unit: number; objects: Map<string, Obj>; items: { id: string; m: M12 }[] } {
  const objects = new Map<string, Obj>();
  const items: { id: string; m: M12 }[] = [];
  let unit = 1;
  let cur: Obj | null = null, curId = "";
  for (const tag of tagsOf(xml)) {
    if (tag.name === "model" && !tag.closing) unit = UNITS[(tag.attrs.unit ?? "millimeter").toLowerCase()] ?? 1;
    else if (tag.name === "object") {
      if (tag.closing) { if (cur) objects.set(curId, cur); cur = null; }
      else { cur = { type: tag.attrs.type ?? "model", name: tag.attrs.name ?? "", mesh: null, components: [] }; curId = tag.attrs.id ?? ""; if (tag.selfClose) { objects.set(curId, cur); cur = null; } }
    } else if (cur && tag.name === "mesh" && !tag.closing) cur.mesh = { v: [], t: [] };
    else if (cur?.mesh && tag.name === "vertex") cur.mesh.v.push(Number(tag.attrs.x), Number(tag.attrs.y), Number(tag.attrs.z));
    else if (cur?.mesh && tag.name === "triangle") cur.mesh.t.push(Number(tag.attrs.v1), Number(tag.attrs.v2), Number(tag.attrs.v3));
    else if (cur && tag.name === "component") cur.components.push({ id: tag.attrs.objectid ?? "", path: tag.attrs.path ?? null, m: matrixOf(tag.attrs.transform) });
    else if (tag.name === "item" && !tag.closing) items.push({ id: tag.attrs.objectid ?? "", m: matrixOf(tag.attrs.transform) });
  }
  return { unit, objects, items };
}

/** The meshes of a 3MF file, one for each object that is built (an assembly's parts are each their own, at their places), in millimetres, as corners (nine numbers for each triangle). */
export async function parse3mf(bytes: Uint8Array, opts: { unitMm?: number } = {}): Promise<Parsed<{ name: string; corners: Float64Array }[]>> {
  const z = await unzip(bytes);
  if (!z.ok) return z;
  const files = z.value;
  const rels = files.get("_rels/.rels");
  const mainPath = rels ? /Target="\/?([^"]+\.model)"/i.exec(new TextDecoder().decode(rels))?.[1] : undefined;
  const main = files.get(mainPath ?? "3D/3dmodel.model") ?? [...files.entries()].find(([k]) => k.endsWith(".model"))?.[1];
  if (!main) return { ok: false, error: "this 3MF file has no model in it" };
  const model = parseModel(new TextDecoder().decode(main));
  if (opts.unitMm) model.unit = opts.unitMm; // (the person's choice over the unit the file says)
  const others = new Map<string, ReturnType<typeof parseModel>>();
  const notes: string[] = [];
  const out: { name: string; corners: Float64Array }[] = [];
  let skipped = 0;
  const walk = async (m: ReturnType<typeof parseModel>, id: string, tf: M12, nameHint: string, depth: number): Promise<string | null> => {
    const o = m.objects.get(id);
    if (!o) return `an object (${id}) that the file builds is not in it`;
    if (depth > 8) return "the components of this 3MF nest too deeply";
    if (o.type !== "model" && o.type !== "") { skipped++; return null; } // (support, surface and other objects are not parts)
    if (o.mesh) {
      const { v, t } = o.mesh;
      if (t.some((i) => !(i >= 0 && i * 3 + 2 < v.length))) return `an object of this 3MF points at a corner that is not there`;
      const flip = det3(tf) < 0;
      const corners = new Float64Array(t.length * 3);
      for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) {
        const idx = t[i + (flip && k > 0 ? 3 - k : k)]!;
        const [x, y, zz] = [v[3 * idx]!, v[3 * idx + 1]!, v[3 * idx + 2]!];
        for (let c = 0; c < 3; c++) corners[(i + k) * 3 + c] = (x * tf[c]! + y * tf[3 + c]! + zz * tf[6 + c]! + tf[9 + c]!) * model.unit;
      }
      out.push({ name: o.name || nameHint, corners });
    }
    for (const c of o.components) {
      let sub = m;
      if (c.path) {
        const key = c.path.replace(/^\//, "");
        if (!others.has(key)) { const f = files.get(key); if (!f) return `a part of this 3MF (${key}) is not in the file`; others.set(key, parseModel(new TextDecoder().decode(f))); }
        sub = others.get(key)!;
      }
      const err = await walk(sub, c.id, compose(c.m, tf), o.name || nameHint, depth + 1);
      if (err) return err;
    }
    return null;
  };
  if (!model.items.length) return { ok: false, error: "this 3MF file builds nothing (it has no items)" };
  for (const item of model.items) { const err = await walk(model, item.id, item.m, "", 0); if (err) return { ok: false, error: err }; }
  if (skipped) notes.push(`${skipped} object${skipped === 1 ? " that is not a part" : "s that are not parts"} (supports, surfaces) left out`);
  const total = out.reduce((a, o) => a + o.corners.length / 9, 0);
  if (total > MAX_MESH_TRIANGLES) return { ok: false, error: tooMany(total) };
  return out.length ? { ok: true, value: out, notes } : { ok: false, error: "this 3MF file has no solid objects in it" };
}

// ---------- making a mesh ready ----------
/** The corners joined where they coincide (to a tenth of a micron), triangles with no area dropped. */
export function weld(corners: ArrayLike<number>): { mesh: Mesh; dropped: number } {
  const at = new Map<string, number>();
  const verts: number[] = [];
  const tris: number[] = [];
  let dropped = 0;
  const pt = (i: number): number => {
    const [x, y, z] = [corners[3 * i]!, corners[3 * i + 1]!, corners[3 * i + 2]!];
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let n = at.get(key);
    if (n === undefined) { n = verts.length / 3; at.set(key, n); verts.push(x, y, z); }
    return n;
  };
  for (let t = 0; t + 2 < corners.length / 3; t += 3) {
    const [a, b, c] = [pt(t), pt(t + 1), pt(t + 2)];
    if (a === b || b === c || a === c) { dropped++; continue; }
    tris.push(a, b, c);
  }
  return { mesh: { vertices: Float32Array.from(verts), triangles: Uint32Array.from(tris) }, dropped };
}

/**
 * The shells of a welded mesh, each closed and with all its triangles running the same way, turned so the normals point out; or why it cannot be a solid (open edges: holes in the surface; edges shared by more than two
 * triangles; a surface that cannot be oriented). Triangles turned to agree with their neighbours, and shells that were inside out, are counted.
 */
export function shellsOf(mesh: Mesh): Parsed<{ shells: Mesh[]; turned: number; insideOut: number }> {
  const { vertices: v, triangles: t } = mesh;
  const nt = t.length / 3;
  const nv = v.length / 3;
  const edge = new Map<number, number[]>(); // undirected edge -> triangles using it
  for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) { const [a, b] = [t[3 * i + k]!, t[3 * i + (k + 1) % 3]!]; const key = Math.min(a, b) * nv + Math.max(a, b); (edge.get(key) ?? edge.set(key, []).get(key)!).push(i); }
  let open = 0, many = 0;
  for (const list of edge.values()) { if (list.length === 1) open++; else if (list.length > 2) many++; }
  if (open || many) return { ok: false, error: `this mesh is not a closed solid: ${[open ? `${open} edge${open === 1 ? " is" : "s are"} open (holes in the surface)` : "", many ? `${many} edge${many === 1 ? " is" : "s are"} shared by more than two triangles` : ""].filter(Boolean).join(" and ")}. Repair it in a mesh program first (the Make Manifold and Fill Holes tools in Blender, MeshLab or Netfabb)` };
  const flip = new Int8Array(nt).fill(-1); // -1: not reached, 0: as it is, 1: turned
  const corners = (i: number): [number, number, number] => (flip[i] === 1 ? [t[3 * i]!, t[3 * i + 2]!, t[3 * i + 1]!] : [t[3 * i]!, t[3 * i + 1]!, t[3 * i + 2]!]);
  const shells: Mesh[] = [];
  let turned = 0, insideOut = 0;
  for (let seed = 0; seed < nt; seed++) {
    if (flip[seed] !== -1) continue;
    flip[seed] = 0;
    const comp = [seed];
    for (let q = 0; q < comp.length; q++) {
      const i = comp[q]!;
      const c = corners(i);
      for (let k = 0; k < 3; k++) {
        const [a, b] = [c[k]!, c[(k + 1) % 3]!];
        for (const j of edge.get(Math.min(a, b) * nv + Math.max(a, b))!) {
          if (j === i) continue;
          // the neighbour must run the edge the other way: b to a
          const o = [t[3 * j]!, t[3 * j + 1]!, t[3 * j + 2]!];
          const same = [0, 1, 2].some((m) => o[m] === a && o[(m + 1) % 3] === b); // (as it is, it runs a to b)
          const want = same ? 1 : 0;
          if (flip[j] === -1) { flip[j] = want; comp.push(j); if (want) turned++; }
          else if (flip[j] !== want) return { ok: false, error: "this mesh cannot be a solid: its surface cannot be given an inside and an outside (a twisted or one-sided surface)" };
        }
      }
    }
    // outwards: a positive volume
    let vol = 0;
    for (const i of comp) { const [a, b, c] = corners(i).map((n) => [v[3 * n]!, v[3 * n + 1]!, v[3 * n + 2]!]) as [number[], number[], number[]]; vol += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6; }
    if (vol < 0) { for (const i of comp) flip[i] = flip[i] === 1 ? 0 : 1; insideOut++; vol = -vol; }
    if (comp.length < 4 || vol < 1e-9) continue; // (a loose sliver of a few triangles is not a part)
    const map = new Map<number, number>();
    const vs: number[] = [], ts: number[] = [];
    for (const i of comp) for (const n of corners(i)) { let m = map.get(n); if (m === undefined) { m = vs.length / 3; map.set(n, m); vs.push(v[3 * n]!, v[3 * n + 1]!, v[3 * n + 2]!); } ts.push(m); }
    shells.push({ vertices: Float32Array.from(vs), triangles: Uint32Array.from(ts) });
  }
  return shells.length ? { ok: true, value: { shells, turned, insideOut }, notes: [] } : { ok: false, error: "this mesh has no closed body in it" };
}

// ---------- OBJ ----------
/** The corners (nine numbers for each triangle) of a Wavefront OBJ: `v` points and `f` faces (corner numbers counted from 1, or back from the last point when negative, with texture and normal numbers ignored); a face of more than three corners is cut into triangles from its first corner (right for the flat convex faces other programs write; a concave one is cut wrongly); lines, points, groups, materials and curved surfaces are left out and said. An OBJ has no units. */
export function parseObj(text: string): Parsed<Float64Array> {
  const pts: number[] = [];
  const out: number[] = [];
  const notes: string[] = [];
  const left = new Set<string>();
  let bad = 0;
  for (const raw of text.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === "v") {
      const [x, y, z] = rest.map(Number);
      if (![x, y, z].every((n) => Number.isFinite(n))) return { ok: false, error: `this OBJ file has a point that is not three numbers ("${line.slice(0, 40)}")` };
      pts.push(x!, y!, z!);
    } else if (key === "f") {
      const n = pts.length / 3;
      const ix = rest.map((w) => { const i = Number(w.split("/")[0]); return Number.isInteger(i) && i !== 0 ? (i > 0 ? i - 1 : n + i) : -1; });
      if (ix.length < 3 || ix.some((i) => i < 0 || i >= n)) { bad++; continue; }
      for (let k = 1; k + 1 < ix.length; k++) for (const i of [ix[0]!, ix[k]!, ix[k + 1]!]) out.push(pts[3 * i]!, pts[3 * i + 1]!, pts[3 * i + 2]!);
      if (out.length / 9 > MAX_MESH_TRIANGLES) return { ok: false, error: tooMany(Math.floor(out.length / 9)) };
    } else if (key === "l" || key === "p") left.add(key === "l" ? "lines" : "points");
    else if (key && ["curv", "curv2", "surf", "cstype", "deg"].includes(key)) left.add("curved surfaces");
  }
  if (bad) return { ok: false, error: `this OBJ file has ${bad} face${bad === 1 ? "" : "s"} that name a point that is not there (or fewer than three corners)` };
  if (!out.length) return { ok: false, error: pts.length ? "this OBJ file has points but no faces (f lines)" : "this is not an OBJ file (no v or f lines in it)" };
  if (left.size) notes.push(`${[...left].join(" and ")} in the file left out`);
  return { ok: true, value: Float64Array.from(out), notes };
}
