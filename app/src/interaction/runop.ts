// Making the step of an operation (`operations.opCommand`) and handing it to the session. Pulling or pushing a face the body already has changes the step that made it (`faceedit.ts`); if
// the steps after it cannot take the new size, the old way is used instead (a prism is added), and it says so.
import type { Session } from "./session.ts";
import { scene as sceneOf, run } from "./session.ts";
import type { Command } from "../operation/commands.ts";
import type { Ref } from "../shared/ref.ts";
import { apply } from "../operation/commands.ts";
import type { Op } from "./operations.ts";
import { opCommand, valueOf, bodyMotion } from "./operations.ts";
import { heldCommand, constrainedMotion } from "./mate.ts";
import { mateStatus, canonBody } from "../operation/mates.ts";
import { isTangentArc } from "./faceedit.ts";
import { axisAcross } from "./revolve.ts";
import { limitedOp, hardCollision, hardNames } from "./hard.ts";

/** Run the step of `op` on `sess`. Returns the new session and whether it fell back to a prism; null when the operation has no step yet. */
export function runOp(sess: Session, op0: Op): { session: Session; cmd: Command } | null {
  const r = runOpCore(sess, op0);
  const sc = sceneOf(sess);
  if (!r || !(sc.hard?.length || sc.fixed?.length)) return r;
  // a change that hard bodies stopped (refused when typed, or a drag taken only as far as it could go) is a violated constraint like any other: the bodies flash, it says so, and the button deletes their hardness and makes the change as asked (`dec_constraint_uniformity`, `in_1082`)
  const limit = limitedOp(sc, op0);
  if (!limit || !limit.hit?.length || (r.session.conflict && r.session.conflict !== sess.conflict)) return r;
  // what the button does once the hardness is gone: a refusal made nothing, so the change as asked; a drag that was cut short made the part that was free, so the rest of the move (a turn that was cut short is not continued: the hardness alone is deleted)
  let again: Command | null = null;
  if ("why" in limit) again = opCommand(sc, op0);
  else if (op0.kind === "move" && op0.free && limit.op.free) again = opCommand(sceneOf(r.session), { ...op0, free: op0.free.map((v, i) => Math.round((v - limit.op.free![i]!) * 1e3) / 1e3) as unknown as typeof op0.free });
  const conflict = hardConflict(sess, limit.hit, op0.parts.filter((q) => sc.parts[q]?.kind === "body"), again);
  if (!conflict) return r;
  const named = hardNames(sc, limit.hit);
  return { ...r, session: { ...r.session, conflict, message: "why" in limit ? r.session.message : `it was taken as far as it could go: it ran into ${named || "another hard body"} (hard bodies do not go into each other)` } };
}

/** The conflict of a change that hard bodies stopped: the hardness of the bodies it ran into is the constraint (of the bodies that moved when none of those is hard), and it can be deleted to make the change as asked. Null when no body is hard. */
function hardConflict(sess: Session, hit: readonly Ref[] | undefined, group: readonly Ref[], asked: Command | null): Session["conflict"] {
  const sc = sceneOf(sess);
  const names = (rs: readonly Ref[]): string[] => rs.flatMap((r) => { const p = sc.parts[r]; return p?.kind === "body" && p.id ? [p.id] : []; });
  const hard = (id: string): boolean => !!sc.hard?.includes(id) || !!sc.fixed?.includes(id);
  let soften = names(hit ?? []).filter(hard);
  if (!soften.length) soften = names(group).filter(hard);
  if (!soften.length) return null;
  return { culprits: [], victims: [], soften, parts: [...(hit ?? [])] as string[], ...(asked ? { retry: asked } : {}) };
}

function runOpCore(sess: Session, op0: Op): { session: Session; cmd: Command } | null {
  // hard bodies do not go into each other (`dec_hard_bodies`, `in_473`): a drag is taken as far as it can go, a typed number that would run into one is refused with the reason
  const limit = limitedOp(sceneOf(sess), op0);
  if (limit && "why" in limit) return { session: { ...sess, message: limit.why }, cmd: { type: "batch", commands: [] } };
  const op = limit ? limit.op : op0;
  if (op.kind === "revolve") { const why = axisAcross(sceneOf(sess), op); if (why) return { session: { ...sess, message: why }, cmd: { type: "batch", commands: [] } }; } // (`in_520`)
  // a body that is moved or turned against its standing mates: what is made is the pose they leave it at, one step, not the move asked for and then their correction (`in_340`)
  const asked = op.target === "body" && (op.kind === "move" || op.kind === "rotate") && op.parts[0] ? bodyMotion(sceneOf(sess), op) : null;
  const held = asked ? heldCommand(sceneOf(sess), op.parts.filter((r) => sceneOf(sess).parts[r]?.kind === "body"), asked, op.grab) : null;
  // the mates settled the pose: if it is in a hard body the move is refused, with what it would run into (`in_477`)
  if (asked && held && sceneOf(sess).hard?.length) {
    const group = op.parts.filter((r) => sceneOf(sess).parts[r]?.kind === "body");
    const settled = constrainedMotion(sceneOf(sess), group, asked, op.grab);
    const into = settled ? hardCollision(sceneOf(sess), group, (b) => settled.rigids.find((q) => q.body === b)?.rigid ?? null) : [];
    if (into.length) { const conflict = hardConflict(sess, into, group, opCommand(sceneOf(sess), op)); return { session: { ...sess, message: `the mates of this body would take it into ${hardNames(sceneOf(sess), into)}: hard bodies do not go into each other`, ...(conflict ? { conflict } : {}) }, cmd: { type: "batch", commands: [] } }; }
  }
  if (held && held.type === "batch" && !held.commands.length) {
    // refused by the mates that hold it: they flash (with the faces they are between) and a button offers to delete them and make the move as asked (`in_366`, `in_436`)
    const group = op.parts.filter((r) => sceneOf(sess).parts[r]?.kind === "body");
    const named = asked ? constrainedMotion(sceneOf(sess), group, asked, op.grab)?.blocked ?? [] : [];
    // (when the solver does not say which held it, every standing mate the bodies have with one that stays is what holds it)
    const blocked = named.length ? named : mateStatus(sceneOf(sess)).filter((m) => m.standing && m.state === "ok" && m.mover && m.other && (group.map((g) => canonBody(sceneOf(sess), g)).includes(m.mover.body) !== group.map((g) => canonBody(sceneOf(sess), g)).includes(m.other.body))).map((m) => m.id);
    const plain = blocked.length ? opCommand(sceneOf(sess), op) : null;
    return { session: { ...sess, message: "the mates of this body leave it nowhere to go that way", ...(blocked.length && plain ? { conflict: { culprits: [], victims: blocked, retry: plain } } : {}) }, cmd: held };
  }
  const cmd = held ?? opCommand(sceneOf(sess), op);
  if (!cmd) {
    // a size that is nothing, or less (a radius of zero, a fillet of nothing): said, not ignored
    const v = valueOf(op);
    const why = op.edit?.kind === "radius" && op.edit.arc ? (isTangentArc(sceneOf(sess), op.edit.circle) ? "the lines tangent to this arc cannot stay tangent at that radius (a locked size or angle holds them)" : "the lines on both ends of this arc do not reach that radius (they would have to move)") : "it would be zero or less";
    // (the constraints that hold it flash and can be deleted: a refusal that blames a constraint always says which, `dec_constraint_uniformity`)
    const holders = op.edit && v !== null && v !== 0 ? holdingPart(sceneOf(sess), op.edit.kind === "radius" ? [op.edit.circle] : op.parts) : [];
    return op.edit && v !== null && v !== 0 ? { session: { ...sess, message: `that size is not possible: ${why}`, ...(holders.length ? { conflict: { culprits: holders, victims: holders } } : {}) }, cmd: { type: "batch", commands: [] } } : null;
  }
  if (!op.edit || op.noEdit || (op.faceKind && op.faceKind !== "move")) {
    const corner = op.kind === "edge" ? withCorner(cmd) : null; // (a fillet or chamfer the kernel cannot make on the edge alone is made with the edges that meet it at a corner, `in_379`)
    const done = run(sess, cmd, { ...(op.target === "body" ? { ownHold: true } : {}), ...(corner ? { fallback: corner } : {}) }); // (a body that is moved has its own check below, which names the sketch it would stretch)
    if (corner && done.message && sceneOf(done).steps.length === sceneOf(sess).steps.length) { const again = run(sess, corner); if (sceneOf(again).steps.length > sceneOf(sess).steps.length) return { session: again, cmd: corner }; }
    // an extrusion onto bodies: whether it adds a piece or cuts is decided now, once, and kept in the step (`in_295`); decided again at every replay, a body that grew later would be cut by a piece that only stood beside it
    // (figures extruded together are steps of their own, `in_353`: they are decided together, below)
    const extrudes = cmd.type === "batch" ? cmd.commands : [cmd];
    if ((op.kind === "extrude" || op.kind === "revolve" || op.kind === "loft" || op.kind === "sweep") && extrudes.length && extrudes.every((c): c is Extract<Command, { type: "addStep" }> => c.type === "addStep" && (c.step.type === "extrude" || c.step.type === "revolve" || c.step.type === "loft" || c.step.type === "sweep")) && !done.message && (sceneOf(sess).steps.length || extrudes.length > 1)) {
      const [volume, count] = [(x: Session): number => Object.values(sceneOf(x).parts).reduce((a, q) => a + (q.kind === "body" ? (q.volume ?? 0) : 0), 0), (x: Session): number => Object.values(sceneOf(x).parts).filter((q) => q.kind === "body").length];
      // (decided from the answer for all of them together, the one the kernel already has from the preview: asking it for each step on its own would ask for lists it has not worked out, and in the browser its answer comes late)
      // the kernel's answer is still to come (the browser): the volumes of `done` are the older ones, so nothing is decided now; the session keeps what it needs and decides when the answer is here (`in_412`)
      if (done.outcome.kernel?.stale) return { session: { ...done, modeFrom: { volume: volume(sess), count: count(sess), extrudes: extrudes.length } }, cmd };
      const grown = count(done) - count(sess);
      const mode = volume(done) < volume(sess) - 1e-6 * Math.max(1, volume(sess)) ? "cut" : grown >= extrudes.length ? "new" : "add"; // (a cut, pieces of their own, or joined to a body they touch)
      const tagged: Command[] = (extrudes as Extract<Command, { type: "addStep" }>[]).map((c) => ({ ...c, step: { ...c.step, params: { ...c.step.params, mode } } }));
      const whole: Command = tagged.length === 1 ? tagged[0]! : { type: "batch", commands: tagged };
      const again = run(sess, whole);
      if (!again.message) return { session: again, cmd: whole };
    }
    // a body moved, turned or scaled whole brings its sketches with it; a constraint that ties one of them to something that stays would pull it out of shape instead (`in_293`): that is refused, and the constraint is named
    if (op.target === "body" && (op.kind === "move" || op.kind === "rotate" || op.kind === "scale") && !done.message) {
      const held = heldBack(sceneOf(sess), sceneOf(done), cmd, op.kind === "scale" ? (valueOf(op) ?? 1) : 1);
      if (held) return { session: { ...sess, message: `this body cannot ${op.kind === "move" ? "move" : op.kind === "rotate" ? "turn" : "scale"}: a constraint ties its sketch to something that stays (${held.names}): remove it, or move that too`, conflict: { culprits: held.ids, victims: held.ids, retry: cmd } }, cmd } // (the constraints are named, they flash, and the button deletes them and makes the move: one refusal rule, `in_665`);
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
    if (!held) { const holders = holdingSide(sceneOf(sess), cmd.commands.flatMap((c) => (c.type === "movePart" ? [c.ref] : []))); edited = { ...sess, message: "the constraints on the sketch would put it back", ...(holders.length ? { conflict: { culprits: holders, victims: holders, retry: cmd } } : {}) }; }
  }
  if (!edited.message) return { session: edited, cmd };
  // the side of a sketch that cannot move: no prism is added in its place (`in_208`); the constraints that hold it flash and the sketch stays as it was
  if (op.edit.kind === "side") return { session: { ...sess, message: `that side cannot move: ${edited.message}`, conflict: (() => { const held = holdingSide(sceneOf(sess), op.edit.corners); return { culprits: held, victims: held, ...(held.length ? { retry: cmd } : {}) }; })() }, cmd }; // (the same: the button deletes what holds it and moves the side, `in_665`)
  if (op.rounded) return { session: { ...edited, message: `that size cannot be made: ${edited.message}` }, cmd }; // (a fillet or chamfer face has no prism to fall back on)
  // the wall of one arc of a circle (a tooth of a gear): a prism of its circle would be a ring round the whole circle, all the teeth, not that wall (`in_265`)
  if (ofCircle) return { session: { ...edited, message: `that size cannot be made: ${edited.message}` }, cmd };
  const prism = opCommand(sceneOf(sess), { ...op, noEdit: true });
  if (!prism) return { session: edited, cmd };
  const made = run(sess, prism);
  return { session: made.message ? edited : { ...made, message: "the step that made this face could not take that size: a push / pull was added instead" }, cmd: prism };
}

/** The command of a fillet or chamfer with the one thing changed: the step may round the edges that meet its edges at a corner too (`corner`, `in_379`); null if it is not one. */
export function withCorner(cmd: Command): Command | null {
  if (cmd.type === "addStep" && cmd.step.type === "edgeMod") return { ...cmd, step: { ...cmd.step, params: { ...cmd.step.params, corner: 1 } } };
  return null;
}

/** The constraints that tie the corners of a sketch side to the rest of the sketch. */
/** The constraints that hold a part: the ones that name it or a line or corner of it, or a line that is tangent to it. */
function holdingPart(scene: ReturnType<typeof sceneOf>, refs: readonly string[]): string[] {
  const own = new Set<string>(refs);
  for (const r of refs) { const p = scene.parts[r as never]; if (p?.kind === "circle") own.add(p.center); }
  const tied = new Set<string>(own);
  for (const r of scene.relations) if (r.kind === "tangent" && r.parts.some((x) => own.has(x))) for (const x of r.parts) tied.add(x); // (a line tangent to the arc is held by what holds the line)
  for (const q of Object.values(scene.parts)) if (q.kind === "line" && tied.has(q.ref)) { tied.add(q.a); tied.add(q.b); }
  return scene.relations.filter((r) => r.locked !== false && r.kind !== "arcEnds" && r.parts.some((x) => tied.has(x))).map((r) => r.id);
}
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
  // a sketch that did not arrive where the move took it (a circle tied concentric with a hole that stays is pulled back to it, `in_918`): not out of shape, but held all the same
  if (!deformed) {
    const raw = apply(before, cmd);
    if (raw.ok) for (const r of moved) {
      const [want, got] = [raw.value.parts[r as keyof typeof raw.value.parts], after.parts[r as keyof typeof after.parts]];
      if (want?.kind === "corner" && got?.kind === "corner" && Math.abs(want.at[0] - got.at[0]) + Math.abs(want.at[1] - got.at[1]) + Math.abs(want.at[2] - got.at[2]) > 1e-3) deformed = true;
    }
  }
  if (!deformed) return null;
  const parts = new Set<string>([...moved].flatMap((r) => { const p = before.parts[r]; return p?.kind === "line" ? [r, p.a, p.b, ...(p.center ? [p.center] : [])] : p?.kind === "circle" ? [r, p.center] : [r]; }));
  const ties = before.relations.filter((rel) => rel.locked !== false && rel.parts.some((x) => parts.has(x)) && rel.parts.some((x) => !parts.has(x)));
  return { ids: ties.map((t) => t.id), names: ties.map((t) => t.id).join(", ") || "a relation" };
}
