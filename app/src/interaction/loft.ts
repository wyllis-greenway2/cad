// A loft through sketches (`dec_loft_sketches`, `in_431`, `in_432`): two or more closed sketches, in the order they were picked, joined side to side into one body. This file is what the interaction
// needs of it: the step it makes, the chips of its bubble and the start points it shows. The kernel makes the body (`loft` in `interpreter.mjs`), `compiler/loftmatch.ts` matches the outlines.
import type { Scene, Figure } from "../operation/scene.ts";
import { nextId, figureParams } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import { loopOf } from "../operation/loops.ts";
import type { Op } from "./operations.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot } from "../math/vec.ts";
import { pointOf, normalOfPlane } from "../operation/part.ts";
import { typedNumber } from "../shared/numbers.ts";
import { drawnRef } from "../shared/ref.ts";

/** The step of a loft: the first sketch is the step's own figure, the others its siblings (the way figures are carried by an extrude), and how the outlines are joined and matched. */
function loftStep(scene: Scene, op: Op): Command | null {
  const figs = op.loftFigs;
  if (!figs || figs.length < 2) return null;
  const shift = figs.map((_, i) => op.loftShift?.[i] ?? 0);
  const rev = figs.map((_, i) => (op.loftRev?.[i] ? 1 : 0));
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "loft", parts: figs[0]!.outer, params: { ...figureParams(figs), ...(op.loftRuled ? { ruled: 1 } : {}), ...(op.loftSplit ? { split: 1 } : {}), ...(shift.some((x) => x) ? { shift: shift.join(",") } : {}), ...(rev.some((x) => x) ? { rev: rev.join(",") } : {}) } } };
}

/** The step, with the sketches that were given a distance moved first (one command, so one undo): `loftPlaced` says by how much (`in_490`). */
export function loftCommand(scene: Scene, op: Op): Command | null {
  const step = loftStep(scene, op);
  const figs = op.loftFigs;
  if (!step || !figs) return step;
  const { shift } = loftPlaced(scene, op);
  const base = nextId(scene, "p");
  const moves = figs.flatMap((f, i): Command[] => {
    if (!shift[i] || Math.hypot(...shift[i]!) < 1e-9) return [];
    const parts = figureParts(scene, f);
    const byPlane = new Map<Ref, Ref[]>();
    for (const r of parts) { const q = scene.parts[r]; if (q?.plane) byPlane.set(q.plane, [...(byPlane.get(q.plane) ?? []), r]); }
    return [...byPlane.entries()].map(([plane, ps], k): Command => ({ type: "transformFigure", parts: ps, plane, newPlane: drawnRef(`${base}.l${i}x${k}`), turns: [], pivot: [0, 0, 0], translate: shift[i]! }));
  });
  if (!moves.length) return step;
  const moved = new Set<Ref>(figs.flatMap((f, i) => (shift[i] && Math.hypot(...shift[i]!) > 1e-9 ? figureParts(scene, f) : [])));
  const released = scene.relations.filter((r) => r.kind === "fixed" && r.parts.every((q) => moved.has(q))).map((r): Command => ({ type: "removeRelation", id: r.id }));
  return { type: "batch", commands: [...released, ...moves, step] };
}

/** Every drawn part of a sketch (its sides, their corners, circles and centres, and what is inside it): what moves when the sketch does. */
function figureParts(scene: Scene, fig: Figure): Ref[] {
  const out = new Set<Ref>();
  for (const r of [...fig.outer, ...fig.holes.flat()]) {
    const p = scene.parts[r];
    if (!p) continue;
    out.add(r);
    if (p.kind === "line") { out.add(p.a); out.add(p.b); if (p.center) out.add(p.center); }
    if (p.kind === "circle") out.add(p.center);
  }
  return [...out];
}
/** The middle of a sketch: the mean of its corners, a circle's centre. */
function middleOfFigure(scene: Scene, fig: Figure): Vec3 | null {
  const get = (r: Ref) => scene.parts[r];
  const pts = fig.outer.flatMap((r) => { const p = get(r); return p?.kind === "line" ? [pointOf(get, p.a), pointOf(get, p.b)] : p?.kind === "circle" ? [pointOf(get, p.center)] : []; }).filter((q): q is Vec3 => !!q);
  return pts.length ? scale(pts.reduce((a, q) => add(a, q), [0, 0, 0] as Vec3), 1 / pts.length) : null;
}
/** The normal of a sketch's plane, or null. */
function normalOfFigure(scene: Scene, fig: Figure): Vec3 | null {
  const first = scene.parts[fig.outer[0]!];
  const pl = first?.plane ? scene.parts[first.plane] : undefined;
  return pl?.kind === "plane" ? normalOfPlane(pl) : null;
}
/**
 * Where the sketches stand with the distances typed between them (`in_490`, `in_491`): the distance from one sketch to the next is measured along the normal of the earlier sketch's plane (turned to point
 * toward the later one), from the earlier sketch's middle to the later's; typing it moves that sketch and all after it along that normal (their distances to each other stay). Where the later sketch lies in the
 * earlier one's plane there is no distance along the normal: the straight distance between the middles is used. `shift[i]` is how far sketch i is moved, `mids` where the middles end up, `gaps` the distances now.
 */
export function loftPlaced(scene: Scene, op: Op): { shift: Vec3[]; mids: Vec3[]; gaps: number[] } {
  const figs = op.loftFigs ?? [];
  const base = figs.map((f) => middleOfFigure(scene, f));
  const shift: Vec3[] = [];
  const mids: Vec3[] = [];
  const gaps: number[] = [];
  base.forEach((c, i) => {
    if (!c) { shift.push([0, 0, 0]); mids.push([0, 0, 0]); return; }
    let t: Vec3 = i ? shift[i - 1]! : [0, 0, 0];
    let d = 0;
    if (i && base[i - 1]) {
      const v = sub(add(c, t), mids[i - 1]!);
      const n = normalOfFigure(scene, figs[i - 1]!);
      const along = n ? dot(v, n) : 0;
      const dir: Vec3 = n && Math.abs(along) > 1e-9 ? scale(n, Math.sign(along)) : Math.hypot(...v) > 1e-9 ? scale(v, 1 / Math.hypot(...v)) : [0, 0, 0];
      d = dot(v, dir);
      const typed = typedNumber(op.loftGaps?.[i - 1] ?? "");
      if (typed !== null && typed >= 0 && Math.hypot(...dir) > 0) { t = add(t, scale(dir, typed - d)); d = typed; }
    }
    shift.push(t);
    mids.push(add(c, t));
    if (i) gaps.push(d);
  });
  return { shift, mids, gaps };
}
/** The bubbles of the distances (`in_490`): one on the line from each sketch's middle to the next, at its middle. */
export function loftGapNumbers(scene: Scene, op: Op): { index: number; sketch: number; distance: number; at: Vec3 }[] {
  const { mids, gaps } = loftPlaced(scene, op);
  return gaps.map((distance, i) => ({ index: 10 + i, sketch: i + 1, distance, at: scale(add(mids[i]!, mids[i + 1]!), 0.5) }));
}

/** How many sides each sketch has (a circle has none to start from: 0). */
function sidesOf(scene: Scene, fig: Figure): number {
  const first = scene.parts[fig.outer[0]!];
  if (!first || first.kind === "circle") return 0;
  const loop = loopOf(lookup(scene), fig.outer);
  return loop.ok ? loop.corners.length : 0;
}

export interface LoftChip { id: string; label: string; title: string; on: boolean }
/** The choices of the loft's bubble: smooth or ruled, split to match, and for each sketch a start point (each press moves it on to the next corner) and a direction. */
export function loftChips(scene: Scene, op: Op): LoftChip[] {
  const figs = op.loftFigs ?? [];
  const chips: LoftChip[] = [
    { id: "smooth", label: "Smooth", title: "Joined by a smooth surface through every sketch", on: !op.loftRuled },
    { id: "ruled", label: "Ruled", title: "Straight between each two sketches", on: !!op.loftRuled },
    { id: "split", label: "Split to match", title: "Where the sketches have different numbers of sides, cut the ones with fewer (a side in two, a circle into arcs) so they match; the shapes do not change", on: !!op.loftSplit },
  ];
  figs.forEach((f, i) => {
    if (!sidesOf(scene, f)) return;
    chips.push({ id: `start:${i}`, label: `Start ${i + 1}`, title: `Move the start point of sketch ${i + 1} (the amber dot) on to the next corner: the sketches are joined from start to start`, on: (op.loftShift?.[i] ?? 0) !== 0 });
    chips.push({ id: `rev:${i}`, label: `Reverse ${i + 1}`, title: `Take sketch ${i + 1} round the other way`, on: !!op.loftRev?.[i] });
  });
  return chips;
}

/** A press on one of the chips: the op with its choice made. */
export function loftChoice(scene: Scene, op: Op, id: string): Op {
  if (id === "smooth") return { ...op, loftRuled: false };
  if (id === "ruled") return { ...op, loftRuled: true };
  if (id === "split") return { ...op, loftSplit: !op.loftSplit };
  const [what, k] = id.split(":");
  const i = Number(k);
  const fig = op.loftFigs?.[i];
  if (!fig || !Number.isFinite(i)) return op;
  if (what === "rev") { const rev = [...(op.loftRev ?? [])]; rev[i] = !rev[i]; return { ...op, loftRev: rev }; }
  if (what === "start") { const n = sidesOf(scene, fig); if (!n) return op; const shift = [...(op.loftShift ?? [])]; shift[i] = ((shift[i] ?? 0) + 1) % n; return { ...op, loftShift: shift }; }
  return op;
}

/** The corner each sketch starts at, to show as a dot: where its outline begins once it has been turned round and moved on. Only for sketches that have all the sides there are (a split one starts somewhere new). */
export function loftStarts(scene: Scene, op: Op): Ref[] {
  const figs = op.loftFigs ?? [];
  const most = Math.max(0, ...figs.map((f) => sidesOf(scene, f)));
  return figs.flatMap((f, i) => {
    const n = sidesOf(scene, f);
    if (!n || n !== most) return [];
    const loop = loopOf(lookup(scene), f.outer);
    if (!loop.ok) return [];
    const s = (op.loftShift?.[i] ?? 0) % n;
    const k = op.loftRev?.[i] ? (n - s) % n : s;
    const c = loop.corners[k];
    return c ? [c as Ref] : [];
  });
}

/** The start corner of each sketch as a number bubble at its start dot (`in_488`, `in_489`): 1 is the corner the sketch began at, typing another number moves the start there; one for each sketch with sides. */
export function loftNumbers(scene: Scene, op: Op): { index: number; sketch: number; value: number; sides: number; at: readonly [number, number, number] }[] {
  return (op.loftFigs ?? []).flatMap((f, i) => {
    const n = sidesOf(scene, f);
    const loop = n ? loopOf(lookup(scene), f.outer) : null;
    if (!n || !loop || !loop.ok) return [];
    const s = (op.loftShift?.[i] ?? 0) % n;
    const c = scene.parts[loop.corners[op.loftRev?.[i] ? (n - s) % n : s] as Ref];
    return c?.kind === "corner" ? [{ index: i, sketch: i + 1, value: s + 1, sides: n, at: c.at }] : [];
  });
}

/** A start corner typed for sketch `i` (1 to its number of sides; another number goes round to one that fits). */
export function loftStartTyped(scene: Scene, op: Op, i: number, typed: number): Op {
  const fig = op.loftFigs?.[i];
  const n = fig ? sidesOf(scene, fig) : 0;
  if (!n || !Number.isFinite(typed)) return op;
  const shift = [...(op.loftShift ?? [])];
  shift[i] = ((Math.round(typed) - 1) % n + n) % n;
  return { ...op, loftShift: shift };
}
