// Cut (`in_294`, `q_boolean_regions`): the bodies selected are shown as the parts they make together (only the first, only the second, where they overlap, ...), each with a plus (kept) or a minus (tossed);
// what is kept is made into the result as one `combine` step, joined into one body where it touches or kept as separate bodies. Add is "keep every part and join".
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";

export interface CutState {
  /** the bodies, in the order they were selected (A is the first) */
  bodies: Ref[];
  /** the parts that are kept: each a number whose bits say which bodies the part is in (1: only A; 3: A and B; 2: only B) */
  keep: number[];
  /** the kept parts that touch become one body (else they stay as they are) */
  join: boolean;
}

const LETTERS = "ABCDEFGH";
export interface CutPart { mask: number; at: Vec3; label: string; tip: string; kept: boolean }

type Box = { min: readonly number[]; max: readonly number[] };
const bodyBox = (sc: Scene, ref: Ref): Box | null => { const b = sc.parts[ref]; return b?.kind === "body" && b.bbox ? b.bbox : null; };

/** The parts the bodies make (the ones whose boxes can meet: the kernel says if one is really empty), where to put the control of each, and whether it is kept. */
export function cutParts(sc: Scene, cut: CutState): CutPart[] {
  const boxes = cut.bodies.map((r) => bodyBox(sc, r));
  if (boxes.some((b) => !b) || boxes.length > LETTERS.length) return [];
  const bx = boxes as Box[];
  const centre = (b: Box): Vec3 => [0, 1, 2].map((i) => (b.min[i]! + b.max[i]!) / 2) as unknown as Vec3;
  const out: CutPart[] = [];
  for (let mask = 1; mask < 1 << bx.length; mask++) {
    const inside = bx.filter((_, i) => (mask >> i) & 1);
    const lo = [0, 1, 2].map((a) => Math.max(...inside.map((b) => b.min[a]!)));
    const hi = [0, 1, 2].map((a) => Math.min(...inside.map((b) => b.max[a]!)));
    if (lo.some((v, a) => v >= hi[a]! - 1e-9)) continue; // (boxes that do not meet)
    const names = bx.map((_, i) => LETTERS[i]!).filter((_, i) => (mask >> i) & 1);
    let at: Vec3 = [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2) as unknown as Vec3;
    if (inside.length === 1) {
      // only this body: its middle, moved away from where the other bodies meet it, so the control is on the part that is only its own
      const mine = inside[0]!;
      const others = bx.filter((_, i) => !((mask >> i) & 1));
      if (others.length) {
        const meet = centre({ min: [0, 1, 2].map((a) => Math.min(...others.map((b) => Math.max(b.min[a]!, mine.min[a]!)))), max: [0, 1, 2].map((a) => Math.max(...others.map((b) => Math.min(b.max[a]!, mine.max[a]!)))) });
        const c = centre(mine);
        const d = [c[0] - meet[0], c[1] - meet[1], c[2] - meet[2]];
        const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
        const half = Math.hypot(mine.max[0]! - mine.min[0]!, mine.max[1]! - mine.min[1]!, mine.max[2]! - mine.min[2]!) / 2;
        at = [c[0] + (d[0]! / len) * half * 0.45, c[1] + (d[1]! / len) * half * 0.45, c[2] + (d[2]! / len) * half * 0.45];
      }
    }
    out.push({ mask, at, label: inside.length === 1 ? names[0]! : names.join("∩"), tip: inside.length === 1 ? `only ${names[0]}` : `where ${names.join(" and ")} meet`, kept: cut.keep.includes(mask) });
  }
  return out;
}

/** The step that makes the kept parts. */
export function cutStep(sc: Scene, cut: CutState): Command | null {
  if (!cut.keep.length) return null;
  return { type: "addStep", step: { id: nextId(sc, "s"), type: "combine", parts: cut.bodies, params: { mode: "regions", regions: [...cut.keep].sort((a, b) => a - b).join(","), join: cut.join ? 1 : 0 } } };
}

/** A cut that starts as a subtract: the first body kept, what the others take away tossed. */
export const startCut = (bodies: Ref[]): CutState => ({ bodies, keep: [1], join: true });
