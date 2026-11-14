// The small dot at the middle of every circle and arc that is not used up: it is always shown, so it can be picked to line the curve up with other things (`in_159`).
import type { Scene } from "../operation/scene.ts";
import type { Vec3 } from "../math/vec.ts";
import { lookup } from "../operation/scene.ts";
import { consumed } from "../operation/ownership.ts";
import type { Ref } from "../shared/ref.ts";

export function centreDots(s: Scene): Vec3[] {
  const get = lookup(s);
  const spent = consumed(s);
  const centres = new Set<Ref>();
  for (const p of Object.values(s.parts)) if (p.origin === "drawn" && (p.kind === "circle" || (p.kind === "line" && p.center)) && p.center && !spent.has(p.ref)) centres.add(p.center);
  return [...centres].flatMap((c) => { const q = get(c); return q && q.kind === "corner" ? [q.at] : []; });
}
