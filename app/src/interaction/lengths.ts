// Changing the length of a line of the body (`in_135`): it works like changing the length of a sketch line, from the same bubble. A straight edge of a block is the distance between two
// faces, so the new length is made by pushing or pulling the face at one end of it along the edge, as a push / pull step would.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { normalOfPlane } from "../operation/part.ts";
import { dist, dot, normalize, sub } from "../math/vec.ts";
import { startOp, opCommand } from "./operations.ts";

/** The flat face at an end of this straight edge that stands across it (so pushing it along the edge changes the edge's length), and how far the edge is now. */
function endFace(scene: Scene, line: Ref): { face: Ref; length: number } | null {
  const l = scene.parts[line];
  if (!l || l.kind !== "line" || l.origin !== "body" || l.mid) return null;
  const [a, b] = [scene.parts[l.a], scene.parts[l.b]];
  if (!a || !b || a.kind !== "corner" || b.kind !== "corner") return null;
  const dir = normalize(sub(b.at, a.at));
  for (const [end, sign] of [[b.at, 1], [a.at, -1]] as const) {
    for (const p of Object.values(scene.parts)) {
      if (p.kind !== "plane" || p.origin !== "body" || p.curved || p.rounded) continue;
      const n = normalOfPlane(p);
      if (Math.abs(dot(n, dir) - sign) > 1e-6) continue; // across the edge, facing away along it at that end
      if (Math.abs(dot(n, sub(end, p.at))) < 1e-3) return { face: p.ref, length: dist(a.at, b.at) };
    }
  }
  return null;
}

/** Can the length of this line of the body be set (a block's edge, between two flat faces)? */
export const lengthEditable = (scene: Scene, line: Ref): boolean => !!endFace(scene, line);

/** The command that makes this line of the body `length` long (one push / pull step on the face at its end), or null. */
export function setLineLength(scene: Scene, line: Ref, length: number): Command | null {
  const e = endFace(scene, line);
  if (!e || !(length > 0) || Math.abs(length - e.length) < 1e-9) return null;
  const st = startOp(scene, [e.face], "pushpull");
  return st.ok ? opCommand(scene, { ...st.op, value: length - e.length }) : null;
}
