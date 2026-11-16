// The centre of mass of a body (`dec_measure_report`, `in_574`): of the solid, as if it were the same all through. Worked out from the triangles of the body's faces as the kernel meshes them, by the divergence
// theorem: each triangle with the middle of the body makes a small four-cornered piece, whose signed volume and middle are summed (a hollow body's inner faces face inward and count negative, so a cavity takes nothing).
// The mesh of a round face lies inside the true surface by a few hundredths of a millimetre, so the volume and the centre are that much off for round bodies. Pure; kept for the scene.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";

export interface Mass { /** mm³, from the mesh */ volume: number; centre: Vec3 }
const kept = new WeakMap<Scene, Map<Ref, Mass | null>>();

/** The faces' triangles of a body: with several bodies each face says which it belongs to (`of`), with one they are all its. */
function trianglesOf(scene: Scene, body: Ref): number[] {
  const many = Object.values(scene.parts).filter((p) => p.kind === "body").length > 1;
  const out: number[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "plane" || p.origin !== "body" || !p.mesh) continue;
    if (many && p.of !== body) continue;
    for (let i = 0; i < p.mesh.length; i++) out.push(p.mesh[i]!);
  }
  return out;
}

/** The centre of mass of a body, or null when it has no mesh or no volume. */
export function massOf(scene: Scene, body: Ref): Mass | null {
  let by = kept.get(scene);
  if (!by) kept.set(scene, (by = new Map()));
  if (by.has(body)) return by.get(body)!;
  const t = trianglesOf(scene, body);
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i + 8 < t.length; i += 9) {
    const [ax, ay, az, bx, by2, bz, qx, qy, qz] = [t[i]!, t[i + 1]!, t[i + 2]!, t[i + 3]!, t[i + 4]!, t[i + 5]!, t[i + 6]!, t[i + 7]!, t[i + 8]!];
    const v = (ax * (by2 * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by2 * qx)) / 6; // (the signed volume of the piece from the origin to this triangle)
    vol += v;
    cx += (v * (ax + bx + qx)) / 4; cy += (v * (ay + by2 + qy)) / 4; cz += (v * (az + bz + qz)) / 4;
  }
  const out: Mass | null = Math.abs(vol) > 1e-9 ? { volume: Math.abs(vol), centre: [cx / vol, cy / vol, cz / vol] } : null;
  by.set(body, out);
  return out;
}

/** The centre of mass of several bodies together (each counted for its own volume; where they overlap the overlap counts twice). */
export function massOfAll(scene: Scene, bodies: readonly Ref[]): Mass | null {
  let vol = 0, x = 0, y = 0, z = 0;
  for (const b of bodies) { const m = massOf(scene, b); if (!m) continue; vol += m.volume; x += m.centre[0] * m.volume; y += m.centre[1] * m.volume; z += m.centre[2] * m.volume; }
  return vol > 0 ? { volume: vol, centre: [x / vol, y / vol, z / vol] } : null;
}

/** The faces' triangles of a body (the same as the centre of mass is worked out from). */
export const bodyTriangles = trianglesOf;
