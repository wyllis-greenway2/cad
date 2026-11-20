// The kernel's reference for a line of the body, read from its name alone (so a step can find its lines again). Pure; it lives here, not in the compiler, so that the operation layer can read the names too (`inv_layers`).
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";

const vec = (s: string): Vec3 => s.split(",").map(Number) as unknown as Vec3;
/** The ends and the middle of a line of the body, from its name: { a, b, mid }. */
export function decodeEdge(r: Ref): { a: Vec3; b: Vec3; mid: Vec3; rank?: string; sig?: string } | null {
  const m = /^b\/body\/e@([^~]+)~([^~]+)~([^~]+)$/.exec(r);
  return m ? { a: vec(m[1]!), b: vec(m[2]!), mid: vec(m[3]!) } : null;
}
