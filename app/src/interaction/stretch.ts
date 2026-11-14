// The stretch of a rounding or a prism, on its own (`in_220`, `in_224`, `in_323`, `in_325`): how far each point of the faces that are the rounding moves when the size is another, and a summary of a mesh to compare
// the stretched picture with what the kernel makes. The picture (`ui/view/content.ts`) and the check against the kernel (`frame.ts`) use these same numbers, so what is checked is what is drawn. Pure: numbers in, numbers out.

/** Where a rounding is scaled about: a line (an end that is a corner is scaled about that corner), a circle, a corner, or the plane a prism stands on. */
export type StretchSharp =
  | { kind: "line"; point: readonly number[]; dir: readonly number[]; a: readonly number[]; b: readonly number[]; cornerA: boolean; cornerB: boolean }
  | { kind: "circle"; center: readonly number[]; axis: readonly number[]; radius: number }
  | { kind: "point"; center: readonly number[] }
  | { kind: "plane"; point: readonly number[]; normal: readonly number[] };

/** Which end of a straight sharp edge a point is nearer along it: 0 the start, 1 the end. */
const nearer = (l: { a: readonly number[]; b: readonly number[]; dir: readonly number[] }, x: number, y: number, z: number): 0 | 1 => {
  const s = (x - l.a[0]!) * l.dir[0]! + (y - l.a[1]!) * l.dir[1]! + (z - l.a[2]!) * l.dir[2]!;
  const len = Math.hypot(l.b[0]! - l.a[0]!, l.b[1]! - l.a[1]!, l.b[2]! - l.a[2]!);
  return s < len / 2 ? 0 : 1;
};

/** How far the point (x, y, z) of a face of this group goes when the rounding (or the prism) is `k` times as big. */
export function groupDelta(sharp: StretchSharp, k: number, x: number, y: number, z: number): [number, number, number] {
  if (sharp.kind === "plane") {
    // a prism of another depth: stretched along its normal about the plane it stands on
    const n = sharp.normal;
    const t = (x - sharp.point[0]!) * n[0]! + (y - sharp.point[1]!) * n[1]! + (z - sharp.point[2]!) * n[2]!;
    return [(k - 1) * t * n[0]!, (k - 1) * t * n[1]!, (k - 1) * t * n[2]!];
  }
  if (sharp.kind === "point") {
    // the patch at a corner: scaled about the corner
    return [(k - 1) * (x - sharp.center[0]!), (k - 1) * (y - sharp.center[1]!), (k - 1) * (z - sharp.center[2]!)];
  }
  if (sharp.kind === "line") {
    if ((sharp.cornerA && nearer(sharp, x, y, z) === 0) || (sharp.cornerB && nearer(sharp, x, y, z) === 1)) {
      // near a corner everything is scaled about the corner
      const v = nearer(sharp, x, y, z) === 0 ? sharp.a : sharp.b;
      return [(k - 1) * (x - v[0]!), (k - 1) * (y - v[1]!), (k - 1) * (z - v[2]!)];
    }
    const [px, py, pz] = [x - sharp.point[0]!, y - sharp.point[1]!, z - sharp.point[2]!];
    const along = px * sharp.dir[0]! + py * sharp.dir[1]! + pz * sharp.dir[2]!;
    return [(k - 1) * (px - along * sharp.dir[0]!), (k - 1) * (py - along * sharp.dir[1]!), (k - 1) * (pz - along * sharp.dir[2]!)];
  }
  // about a circle: in the plane through the axis and the point, the point is scaled about where the circle is
  const [px, py, pz] = [x - sharp.center[0]!, y - sharp.center[1]!, z - sharp.center[2]!];
  const zz = px * sharp.axis[0]! + py * sharp.axis[1]! + pz * sharp.axis[2]!;
  const [rx, ry, rz] = [px - zz * sharp.axis[0]!, py - zz * sharp.axis[1]!, pz - zz * sharp.axis[2]!];
  const rho = Math.hypot(rx, ry, rz) || 1e-9;
  const rho2 = sharp.radius + k * (rho - sharp.radius);
  return [(rx / rho) * (rho2 - rho) + sharp.axis[0]! * (k - 1) * zz, (ry / rho) * (rho2 - rho) + sharp.axis[1]! * (k - 1) * zz, (rz / rho) * (rho2 - rho) + sharp.axis[2]! * (k - 1) * zz];
}

/** A point as the key the faces of a group are found by in a mesh (a thousandth of a millimetre). */
export const pointKey = (a: ArrayLike<number>, i: number): string => `${Math.round(a[i]! * 1e3)},${Math.round(a[i + 1]! * 1e3)},${Math.round(a[i + 2]! * 1e3)}`;

/** The mesh's points with those of each group's faces moved for a size `k` times as big (a point in more than one group goes with the first). */
export function stretched(vertices: ArrayLike<number>, groups: readonly { keys: ReadonlySet<string>; sharp: StretchSharp }[], k: number): Float32Array {
  const out = Float32Array.from(vertices as ArrayLike<number> as number[]);
  for (let i = 0; i + 2 < out.length; i += 3) {
    const g = groups.find((q) => q.keys.has(pointKey(vertices, i)));
    if (!g) continue;
    const [dx, dy, dz] = groupDelta(g.sharp, k, out[i]!, out[i + 1]!, out[i + 2]!);
    out[i] = out[i]! + dx; out[i + 1] = out[i + 1]! + dy; out[i + 2] = out[i + 2]! + dz;
  }
  return out;
}

/** What is compared between two meshes of the same body: the volume it holds (signed, from its triangles) and the box round it. Both are the same however finely a curve is cut into facets, to within a little. */
export interface MeshSummary { volume: number; min: [number, number, number]; max: [number, number, number] }
export function summaryOf(vertices: ArrayLike<number>, triangles: ArrayLike<number>): MeshSummary {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < vertices.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j]!, vertices[i + j]!); max[j] = Math.max(max[j]!, vertices[i + j]!); }
  let volume = 0;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [3 * triangles[t]!, 3 * triangles[t + 1]!, 3 * triangles[t + 2]!];
    volume += (vertices[a]! * (vertices[b + 1]! * vertices[c + 2]! - vertices[b + 2]! * vertices[c + 1]!) - vertices[a + 1]! * (vertices[b]! * vertices[c + 2]! - vertices[b + 2]! * vertices[c]!) + vertices[a + 2]! * (vertices[b]! * vertices[c + 1]! - vertices[b + 1]! * vertices[c]!)) / 6;
  }
  return { volume, min, max };
}

/** Why a stretched picture is not what the kernel made (a volume a hundredth different, or a box a twentieth of a millimetre off), or null when they agree. */
export function stretchDiffers(picture: MeshSummary, made: MeshSummary): string | null {
  const dv = Math.abs(picture.volume - made.volume);
  if (dv > 0.01 * Math.max(1, Math.abs(made.volume))) return `volume ${Math.round(picture.volume * 100) / 100} against ${Math.round(made.volume * 100) / 100}`;
  for (let j = 0; j < 3; j++) {
    if (Math.abs(picture.min[j]! - made.min[j]!) > 0.05 || Math.abs(picture.max[j]! - made.max[j]!) > 0.05) return `box on axis ${"xyz"[j]}: ${Math.round(picture.min[j]! * 100) / 100}..${Math.round(picture.max[j]! * 100) / 100} against ${Math.round(made.min[j]! * 100) / 100}..${Math.round(made.max[j]! * 100) / 100}`;
  }
  return null;
}
