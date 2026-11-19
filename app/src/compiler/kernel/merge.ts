// The answers of parts made apart, put together into one answer as the kernel gives for a model of many bodies (`dec_progressive_open`, `in_1002`): the vertices and triangles one after the other, a face's place in the triangles and a corner's number moved on by what came
// before, each face and edge saying which body it is of (`body`, its place in `bodies`), the volumes added and the boxes joined. The same arrangement `evaluate.mjs` makes of the bodies of one shape; here the bodies were made one piece at a time.
import type { KernelResult, Vec } from "./adapter.ts";

export function mergeAnswers(parts: readonly KernelResult[]): KernelResult {
  const done = parts.filter((p) => p.mesh && p.bodies?.length);
  const meshes = done.map((p) => p.mesh!);
  const nV = meshes.reduce((a, m) => a + m.vertices.length, 0), nT = meshes.reduce((a, m) => a + m.triangles.length, 0), nS = meshes.reduce((a, m) => a + (m.sharp?.length ?? 0), 0);
  const mesh = done.length ? { vertices: new Float32Array(nV), normals: new Float32Array(nV), triangles: new Uint32Array(nT), sharp: new Float32Array(nS), sharpDeg: meshes.find((m) => m.sharpDeg !== undefined)?.sharpDeg } : null;
  const faces: NonNullable<KernelResult["faces"]> = [], edges: NonNullable<KernelResult["edges"]> = [];
  const bodies: NonNullable<KernelResult["bodies"]> = [];
  const seen = new Map<string, Vec>(), vertexBody = new Map<string, number>();
  let [vo, to, so] = [0, 0, 0];
  for (const p of done) {
    const m = p.mesh!, base = bodies.length;
    mesh!.vertices.set(m.vertices, vo); mesh!.normals.set(m.normals, vo);
    if (m.sharp) { mesh!.sharp!.set(m.sharp, so); so += m.sharp.length; }
    for (let k = 0; k < m.triangles.length; k++) mesh!.triangles[to + k] = m.triangles[k]! + vo / 3;
    for (const f of p.faces ?? []) { const ranges = (f as { ranges?: { start: number; count: number }[] }).ranges; faces.push({ ...f, start: f.start + to, ...(ranges ? { ranges: ranges.map((r) => ({ start: r.start + to, count: r.count })) } : {}), body: base + (f.body ?? 0) }); }
    for (const e of p.edges ?? []) edges.push({ ...e, pts: e.pts.slice(), body: base + (e.body ?? 0) }); // (its own copy of the points: an answer sent to the page gives its buffers away, and the pieces are used again for the next)
    p.vertices?.forEach((v, i) => { const k = v.join(","); if (!seen.has(k)) seen.set(k, v); if (!vertexBody.has(k)) vertexBody.set(k, base + (p.vertexBodies?.[i] ?? 0)); });
    bodies.push(...p.bodies!);
    vo += m.vertices.length; to += m.triangles.length;
  }
  const volumes = done.map((p) => p.volume);
  const all = done.map((p) => p.bbox).filter((b): b is NonNullable<typeof b> => !!b);
  const sum = (f: (p: KernelResult) => number) => parts.reduce((a, p) => a + f(p), 0);
  const perf = parts.every((p) => p.perf) ? { ops: sum((p) => p.perf!.ops), mesh: sum((p) => p.perf!.mesh), faces: sum((p) => p.perf!.faces), edges: sum((p) => p.perf!.edges) } : undefined;
  return {
    ops: parts.flatMap((p) => p.ops),
    finalId: parts.at(-1)?.finalId ?? null,
    ...(parts.some((p) => p.faceNames) ? { faceNames: parts.flatMap((p) => p.faceNames ?? []) } : {}),
    ...(parts.some((p) => p.edgeNames) ? { edgeNames: parts.flatMap((p) => p.edgeNames ?? []) } : {}),
    volume: volumes.length && volumes.every((v) => v !== null) ? volumes.reduce((a, v) => a! + v!, 0) : null,
    bbox: all.length ? { min: [0, 1, 2].map((i) => Math.min(...all.map((b) => b.min[i]!))) as Vec, max: [0, 1, 2].map((i) => Math.max(...all.map((b) => b.max[i]!))) as Vec } : null,
    bodies: done.length ? bodies : null,
    mesh,
    faces: done.length ? faces : null,
    edges: done.length ? edges : null,
    vertices: done.length ? [...seen.values()].map((v) => [...v] as Vec) : null,
    ...(done.length ? { vertexBodies: [...seen.keys()].map((k) => vertexBody.get(k) ?? 0) } : {}),
    totalMs: sum((p) => p.totalMs),
    ...(perf ? { perf } : {}),
  };
}
