// A loft through sketches (`dec_loft_sketches`, `in_431`, `in_432`): two or more closed sketches, in the order they were picked, joined side to side into one body. This file is what the interaction
// needs of it: the step it makes, the chips of its bubble and the start points it shows. The kernel makes the body (`loft` in `interpreter.mjs`), `compiler/loftmatch.ts` matches the outlines.
import type { Scene, Figure } from "../operation/scene.ts";
import { nextId, figureParams } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import { loopOf } from "../operation/loops.ts";
import type { Op } from "./operations.ts";

/** The step of a loft: the first sketch is the step's own figure, the others its siblings (the way figures are carried by an extrude), and how the outlines are joined and matched. */
export function loftCommand(scene: Scene, op: Op): Command | null {
  const figs = op.loftFigs;
  if (!figs || figs.length < 2) return null;
  const shift = figs.map((_, i) => op.loftShift?.[i] ?? 0);
  const rev = figs.map((_, i) => (op.loftRev?.[i] ? 1 : 0));
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "loft", parts: figs[0]!.outer, params: { ...figureParams(figs), ...(op.loftRuled ? { ruled: 1 } : {}), ...(op.loftSplit ? { split: 1 } : {}), ...(shift.some((x) => x) ? { shift: shift.join(",") } : {}), ...(rev.some((x) => x) ? { rev: rev.join(",") } : {}) } } };
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
