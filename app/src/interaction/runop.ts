// Making the step of an operation (`operations.opCommand`) and handing it to the session. Pulling or pushing a face the body already has changes the step that made it (`faceedit.ts`); if
// the steps after it cannot take the new size, the old way is used instead (a prism is added), and it says so.
import type { Session } from "./session.ts";
import { scene as sceneOf, run } from "./session.ts";
import type { Command } from "../operation/commands.ts";
import type { Op } from "./operations.ts";
import { opCommand, valueOf } from "./operations.ts";

/** Run the step of `op` on `sess`. Returns the new session and whether it fell back to a prism; null when the operation has no step yet. */
export function runOp(sess: Session, op: Op): { session: Session; cmd: Command } | null {
  const cmd = opCommand(sceneOf(sess), op);
  if (!cmd) {
    // a size that is nothing, or less (a radius of zero, a fillet of nothing): said, not ignored
    const v = valueOf(op);
    return op.edit && v !== null && v !== 0 ? { session: { ...sess, message: "that size is not possible: it would be zero or less" }, cmd: { type: "batch", commands: [] } } : null;
  }
  if (!op.edit || op.noEdit) return { session: run(sess, cmd), cmd };
  const prism0 = opCommand(sceneOf(sess), { ...op, noEdit: true });
  let edited = run(sess, cmd, { watchAll: true, ...(prism0 && op.edit.kind !== "side" ? { fallback: prism0 } : {}) });
  // moving the side of a sketch: the constraints may have put the corners back (a locked length); that is not an edit
  if (!edited.message && cmd.type === "batch") {
    const after = sceneOf(edited).parts;
    const held = cmd.commands.every((c) => { if (c.type !== "movePart") return true; const q = after[c.ref]; return q?.kind === "corner" && Math.hypot(q.at[0] - c.to[0], q.at[1] - c.to[1], q.at[2] - c.to[2]) < 1e-6; });
    if (!held) edited = { ...sess, message: "the constraints on the sketch would put it back" };
  }
  if (!edited.message) return { session: edited, cmd };
  // the side of a sketch that cannot move: no prism is added in its place (`in_208`); the constraints that hold it flash and the sketch stays as it was
  if (op.edit.kind === "side") return { session: { ...sess, message: `that side cannot move: ${edited.message}`, conflict: { culprits: holdingSide(sceneOf(sess), op.edit.corners), victims: [] } }, cmd };
  if (op.rounded) return { session: { ...edited, message: `that size cannot be made: ${edited.message}` }, cmd }; // (a fillet or chamfer face has no prism to fall back on)
  const prism = opCommand(sceneOf(sess), { ...op, noEdit: true });
  if (!prism) return { session: edited, cmd };
  const made = run(sess, prism);
  return { session: made.message ? edited : { ...made, message: "the step that made this face could not take that size: a push / pull was added instead" }, cmd: prism };
}

/** The constraints that tie the corners of a sketch side to the rest of the sketch. */
function holdingSide(scene: ReturnType<typeof sceneOf>, corners: readonly string[]): string[] {
  const own = new Set<string>(corners);
  const near = new Set<string>(own);
  for (const q of Object.values(scene.parts)) if (q.kind === "line" && (own.has(q.a) || own.has(q.b))) near.add(q.ref);
  return scene.relations.filter((r) => r.locked !== false && r.parts.some((x) => near.has(x))).map((r) => r.id);
}
