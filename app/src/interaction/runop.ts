// Making the step of an operation (`operations.opCommand`) and handing it to the session. Pulling or pushing a face the body already has changes the step that made it (`faceedit.ts`); if
// the steps after it cannot take the new size, the old way is used instead (a prism is added), and it says so.
import type { Session } from "./session.ts";
import { scene as sceneOf, run } from "./session.ts";
import type { Command } from "../operation/commands.ts";
import type { Op } from "./operations.ts";
import { opCommand, valueOf, bodyMotion } from "./operations.ts";
import { heldCommand } from "./mate.ts";
import { isTangentArc } from "./faceedit.ts";

/** Run the step of `op` on `sess`. Returns the new session and whether it fell back to a prism; null when the operation has no step yet. */
export function runOp(sess: Session, op: Op): { session: Session; cmd: Command } | null {
  // a body that is moved or turned against its standing mates: what is made is the pose they leave it at, one step, not the move asked for and then their correction (`in_340`)
  const asked = op.target === "body" && (op.kind === "move" || op.kind === "rotate") && op.parts[0] ? bodyMotion(sceneOf(sess), op) : null;
  const held = asked ? heldCommand(sceneOf(sess), op.parts[0]!, asked) : null;
  if (held && held.type === "batch" && !held.commands.length) return { session: { ...sess, message: "the mates of this body leave it nowhere to go that way" }, cmd: held };
  const cmd = held ?? opCommand(sceneOf(sess), op);
  if (!cmd) {
    // a size that is nothing, or less (a radius of zero, a fillet of nothing): said, not ignored
    const v = valueOf(op);
    const why = op.edit?.kind === "radius" && op.edit.arc ? (isTangentArc(sceneOf(sess), op.edit.circle) ? "the lines tangent to this arc cannot stay tangent at that radius (a locked size or angle holds them)" : "the lines on both ends of this arc do not reach that radius (they would have to move)") : "it would be zero or less";
    return op.edit && v !== null && v !== 0 ? { session: { ...sess, message: `that size is not possible: ${why}` }, cmd: { type: "batch", commands: [] } } : null;
  }
  if (!op.edit || op.noEdit) {
    const done = run(sess, cmd);
    // an extrusion onto bodies: whether it adds a piece or cuts is decided now, once, and kept in the step (`in_295`); decided again at every replay, a body that grew later would be cut by a piece that only stood beside it
    if (op.kind === "extrude" && cmd.type === "addStep" && !done.message && sceneOf(sess).steps.length) {
      const [volume, count] = [(x: Session): number => Object.values(sceneOf(x).parts).reduce((a, q) => a + (q.kind === "body" ? (q.volume ?? 0) : 0), 0), (x: Session): number => Object.values(sceneOf(x).parts).filter((q) => q.kind === "body").length];
      const mode = volume(done) < volume(sess) - 1e-6 * Math.max(1, volume(sess)) ? "cut" : count(done) > count(sess) ? "new" : "add"; // (a cut, a piece of its own, or one joined to a body it touches)
      const tagged: Command = { ...cmd, step: { ...cmd.step, params: { ...cmd.step.params, mode } } };
      const again = run(sess, tagged);
      if (!again.message) return { session: again, cmd: tagged };
    }
    // a body moved, turned or scaled whole brings its sketches with it; a constraint that ties one of them to something that stays would pull it out of shape instead (`in_293`): that is refused, and the constraint is named
    if (op.target === "body" && (op.kind === "move" || op.kind === "rotate" || op.kind === "scale") && !done.message) {
      const held = heldBack(sceneOf(sess), sceneOf(done), cmd, op.kind === "scale" ? (valueOf(op) ?? 1) : 1);
      if (held) return { session: { ...sess, message: `this body cannot ${op.kind === "move" ? "move" : op.kind === "rotate" ? "turn" : "scale"}: a constraint ties its sketch to something that stays (${held.names}): remove it, or move that too`, conflict: { culprits: held.ids, victims: [] } }, cmd };
    }
    return { session: done, cmd };
  }
  const prism0 = opCommand(sceneOf(sess), { ...op, noEdit: true });
  const piece = sceneOf(sess).parts[op.parts[0]!];
  const ofCircle = piece?.kind === "plane" && !!piece.round; // (the wall of one arc of a circle, a tooth of a gear: its circle's prism would be a ring round all the teeth, `in_265`)
  let edited = run(sess, cmd, { watchAll: true, ...(prism0 && op.edit.kind !== "side" && !ofCircle && !op.rounded ? { fallback: prism0 } : {}) });
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
  // the wall of one arc of a circle (a tooth of a gear): a prism of its circle would be a ring round the whole circle, all the teeth, not that wall (`in_265`)
  if (ofCircle) return { session: { ...edited, message: `that size cannot be made: ${edited.message}` }, cmd };
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

/**
 * The constraints that kept the sketches carried with a body from going with it (`in_293`): after the step the lines and circles that were carried must be the same size (times `k` for a scale); where one is not, the relations
 * that tie a carried part to a part that is not carried are the ones that held it. Null when everything went with the body.
 */
function heldBack(before: ReturnType<typeof sceneOf>, after: ReturnType<typeof sceneOf>, cmd: Command, k: number): { ids: string[]; names: string } | null {
  const moved = new Set<string>((cmd.type === "batch" ? cmd.commands : [cmd]).flatMap((c) => (c.type === "transformFigure" ? c.parts : [])));
  if (!moved.size) return null;
  const len = (sc: ReturnType<typeof sceneOf>, a: string, b: string): number | null => { const [p, q] = [sc.parts[a], sc.parts[b]]; return p?.kind === "corner" && q?.kind === "corner" ? Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1], p.at[2] - q.at[2]) : null; };
  let deformed = false;
  for (const r of moved) {
    const p = before.parts[r];
    if (p?.kind === "line") { const [x, y] = [len(before, p.a, p.b), len(after, p.a, p.b)]; if (x !== null && y !== null && Math.abs(y - x * k) > 1e-4 * Math.max(1, x)) deformed = true; }
    if (p?.kind === "circle") { const q = after.parts[r]; if (q?.kind === "circle" && Math.abs(q.radius - p.radius * k) > 1e-4 * Math.max(1, p.radius)) deformed = true; }
  }
  if (!deformed) return null;
  const parts = new Set<string>([...moved].flatMap((r) => { const p = before.parts[r]; return p?.kind === "line" ? [r, p.a, p.b, ...(p.center ? [p.center] : [])] : p?.kind === "circle" ? [r, p.center] : [r]; }));
  const ties = before.relations.filter((rel) => rel.locked !== false && rel.parts.some((x) => parts.has(x)) && rel.parts.some((x) => !parts.has(x)));
  return { ids: ties.map((t) => t.id), names: ties.map((t) => t.id).join(", ") || "a relation" };
}
