// A model of many parts apart made in pieces, nearest the eye first, with the answer so far sent as it goes (`dec_progressive_open`, `in_1002`). Used by the kernel's thread (`kernel-worker.ts`); the kernel, the way to send an answer and the way to tell it
// has been asked to stop come in, so that it is the same code in a test.
import type { Kernel, KernelGraph, KernelResult, Vec } from "./compiler/kernel/adapter.ts";
import { planPieces } from "./compiler/kernel/pieces.ts";
import { mergeAnswers } from "./compiler/kernel/merge.ts";

export interface PieceHooks {
  /** the answer of the parts made so far (a copy that is the receiver's to keep) */
  partial(result: KernelResult): void;
  /** whether the page has asked for this to stop (a newer question is waiting) */
  stopped(): boolean;
  /** let the messages in (a stop may be there) */
  yieldNow(): Promise<void>;
  now(): number;
}
/** How soon after the last answer so far the next is sent: a share of the time spent, and not less than this (ms). */
const EVERY_MS = 200, EVERY_SHARE = 0.2;

/** The whole answer of a graph made in pieces, or `null` if it is not of the kind (it is then made whole by the caller), or `"stopped"` when asked to stop. */
export async function evaluateInPieces(kernel: Pick<Kernel, "evaluate">, graph: KernelGraph, eye: Vec | undefined, hooks: PieceHooks): Promise<KernelResult | null | "stopped"> {
  const plan = planPieces(graph, eye);
  if (!plan) return null;
  const t0 = hooks.now();
  const answers: KernelResult[] = [];
  let sentAt = t0;
  for (const [i, piece] of plan.pieces.entries()) {
    if (hooks.stopped()) return "stopped";
    answers.push(kernel.evaluate(piece.graph));
    const now = hooks.now();
    if (i + 1 < plan.pieces.length && (i === 0 || now - sentAt >= Math.max(EVERY_MS, (now - t0) * EVERY_SHARE))) { // (the first part at once, then every so often)
      hooks.partial({ ...mergeAnswers(answers), partial: { done: i + 1, total: plan.pieces.length } });
      sentAt = hooks.now();
      await hooks.yieldNow();
    }
  }
  return { ...mergeAnswers(answers), totalMs: hooks.now() - t0 };
}
