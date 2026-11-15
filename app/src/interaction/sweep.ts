// A sweep (`dec_sweep`, `in_444`): a closed figure carried along a path of lines and arcs drawn anywhere, ending in a body. This file reads the path from what is selected and makes the step; the kernel
// makes the body (`sweep` in `interpreter.mjs`).
import type { Scene } from "../operation/scene.ts";
import { nextId, figureParams, lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import type { Vec3 } from "../math/vec.ts";
import { pointOf, curveMid } from "../operation/part.ts";
import type { Op } from "./operations.ts";

const num = (v: number): string => String(Math.round(v * 1e6) / 1e6);

/** The path of the selected lines, in order from one end to the other, as the step stores it (`ax,ay,az,bx,by,bz[,mx,my,mz]` a side, `;` between), or why it is not a path. */
export function pathOf(scene: Scene, lines: readonly Ref[]): { ok: true; path: string } | { ok: false; why: string } {
  const get = lookup(scene);
  const segs = lines.map((r) => get(r)).filter((p): p is Extract<NonNullable<ReturnType<typeof get>>, { kind: "line" }> => p?.kind === "line");
  if (!segs.length || segs.length !== lines.length) return { ok: false, why: "select the lines and arcs of the path" };
  const count = new Map<Ref, number>();
  for (const s of segs) for (const c of [s.a, s.b]) count.set(c, (count.get(c) ?? 0) + 1);
  if ([...count.values()].some((n) => n > 2)) return { ok: false, why: "the path branches: it must be one line, arc or chain with two ends" };
  const ends = [...count].filter(([, n]) => n === 1).map(([c]) => c);
  if (ends.length !== 2) return { ok: false, why: "the path must be open, one chain with two ends" };
  const used = new Set<number>();
  let cur = ends[0]!;
  const out: string[] = [];
  while (used.size < segs.length) {
    const i = segs.findIndex((s, k) => !used.has(k) && (s.a === cur || s.b === cur));
    if (i < 0) return { ok: false, why: "the lines of the path are not joined end to end" };
    used.add(i);
    const s = segs[i]!;
    const next = s.a === cur ? s.b : s.a;
    const [p, q] = [pointOf(get, cur), pointOf(get, next)];
    if (!p || !q) return { ok: false, why: "a corner of the path is gone" };
    const m: Vec3 | null = curveMid(get, s);
    out.push([...p, ...q, ...(m ? m : [])].map(num).join(","));
    cur = next;
  }
  return { ok: true, path: out.join(";") };
}

/** The step of a sweep: the shape is the step's figure, the path is stored with it. */
export function sweepCommand(scene: Scene, op: Op): Command | null {
  if (!op.sweepFig || !op.sweepPath) return null;
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "sweep", parts: op.sweepFig.outer, params: { ...figureParams([op.sweepFig]), path: op.sweepPath } } };
}

