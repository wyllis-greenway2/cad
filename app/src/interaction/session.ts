// A session: the history of the scene (every scene already compiled: solved, with body parts and derived faces), the selection, and what the pointer is over.
// This is the one object the app holds. Commands are checked against the whole scene, so a relation to a body corner or a drawing on a body face is valid
// (the gap noted in Handoff 084).
import { mateStatus } from "../operation/mates.ts";
import { putMatesBack, solveStanding } from "./mate.ts";
import { changeWords } from "./changewords.ts";
import { bodyLabel } from "./panels.ts";
import { describedCommand } from "../operation/anchors.ts";
import type { Ref } from "../shared/ref.ts";
import type { Kernel } from "../compiler/kernel/adapter.ts";
import { compile } from "../compiler/compile.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { Command } from "../operation/commands.ts";
import type { History } from "../operation/history.ts";
import { newHistory, exec, undo, redo } from "../operation/history.ts";
import type { Scene } from "../operation/scene.ts";
import type { Result } from "../shared/result.ts";
import { ok } from "../shared/result.ts";
import { fromText, toText } from "../operation/file.ts";
import { emptyScene } from "../operation/scene.ts";
import type { Selection } from "./selection.ts";
import { goIn, afterClick } from "./groupsel.ts";
import { click as clickGrammar, initialClick } from "./selection.ts";
import type { ClickState } from "./selection.ts";

export interface Session {
  readonly history: History;
  readonly click: ClickState;
  readonly hover: Ref | undefined;
  /** The compile result for the scene at the cursor (kernel result, step errors, solver reports). */
  readonly outcome: CompileOutcome;
  /** The last message worth showing ("2 of 3 here", an error), or null. */
  readonly message: string | null;
  readonly outcomeOf: (h: History) => CompileOutcome;
  /** the kernel answers later than it is asked (its own thread): what is shown is made again when the answer comes, and after an undo or redo */
  readonly lagging: boolean;
  /** steps just made while the kernel's answer was still to come: when it comes and one of them could not be made, it is taken back */
  readonly checkSteps?: string[];
  /** what to do instead if one of those steps could not be made (an edit of the step that made a face, refused late: the prism the old way) */
  readonly fallback?: Command;
  /** the last command that was refused because it could not be done without breaking constraints: who tried (`culprits`: relation ids) and what it would have broken (`victims`) */
  readonly conflict: { culprits: string[]; victims: string[]; /** parts of a refused step that are the problem (the edges that cannot take a fillet or chamfer of that size): they flash red (`in_266`) */ parts?: string[] } | null;
  /** the sketch plane whose hidden sketch is shown while a tool sketches in it (`in_211`) */
  readonly reveal?: Ref | null;
}
const revealed = new WeakMap<Scene, Map<string, Scene>>();
/** The scene as it is worked on: with the hidden sketch of the plane being sketched in shown (`in_211`). One object for the same model and plane, so what is kept by scene stays kept. */
export function scene(s: Session): Scene {
  const base = s.history.scene;
  if (!s.reveal) return base;
  const m = revealed.get(base) ?? new Map<string, Scene>();
  revealed.set(base, m);
  return m.get(s.reveal) ?? (m.set(s.reveal, { ...base, reveal: s.reveal }), m.get(s.reveal)!);
}
export const selection = (s: Session): Selection => s.click.selection;

/** The compile step and its cache: the outcome of the latest derive of each scene is kept beside the history, so the view shows errors and the kernel result without compiling twice. */
function makeCompiler(kernel: Kernel) {
  const cache = new WeakMap<Scene, CompileOutcome>();
  const derive = (sc: Scene): Scene => {
    const o = compile(sc, kernel);
    cache.set(o.scene, o);
    return o.scene;
  };
  return { derive, outcomeOf: (h: History): CompileOutcome => cache.get(h.scene)! };
}
const wrap = (history: History, outcomeOf: (h: History) => CompileOutcome, lagging: boolean): Session => ({ history, click: initialClick(), hover: undefined, outcome: outcomeOf(history), message: null, outcomeOf, lagging, conflict: null });

export function createSession(kernel: Kernel, base: Scene = emptyScene()): Session {
  const c = makeCompiler(kernel);
  return wrap(newHistory(base, c.derive), c.outcomeOf, !!kernel.lagging);
}
/** A session from the text of a project file (see `operation/file.ts`), or why it cannot be opened. */
export function openSession(kernel: Kernel, text: string): Result<Session> {
  const c = makeCompiler(kernel);
  const h = fromText(text, c.derive);
  return h.ok ? ok(wrap(h.value, c.outcomeOf, !!kernel.lagging)) : h;
}
export const saveText = (s: Session): string => toText(s.history);
function withHistory(s: Session, h: History, message: string | null = null): Session {
  // the selection keeps only parts that still exist
  return { ...s, history: h, outcome: s.outcomeOf(h), message, conflict: null, click: { ...s.click, selection: s.click.selection.filter((r) => r in h.scene.parts) } };
}

/** The relations a command adds or changes (the ones that "tried" if it cannot be done). */
function relationsOf(c: Command): string[] {
  if (c.type === "addRelation") return [c.relation.id];
  if (c.type === "setRelationValue") return [c.id];
  if (c.type === "batch") return c.commands.flatMap(relationsOf);
  return [];
}
/** The parts a command changes or ties together. */
function partsOf(c: Command): string[] {
  if (c.type === "movePart" || c.type === "setRadius") return [c.ref];
  if (c.type === "addRelation") return [...c.relation.parts];
  if (c.type === "batch") return c.commands.flatMap(partsOf);
  return [];
}
const conflictsOf = (o: CompileOutcome): { planes: string[]; ids: string[] } => ({
  planes: o.solve.planes.filter((p) => p.status === "conflict").map((p) => p.plane),
  ids: o.solve.planes.flatMap((p) => p.conflicts),
});

/** The commands that put the standing mates back, one at a time (each may move what the next rests on); empty when none is off or one cannot be put back. */
/** What is said when standing mates cannot all hold: which ones (`in_329`). */
const atOddsMessage = (scene: Scene, ids: readonly string[], change: string): string => {
  const names = mateStatus(scene).filter((m) => ids.includes(m.id)).map((m) => {
    const rel = scene.relations.find((r) => r.id === m.id);
    const bodies = (rel?.parts ?? []).filter((q) => scene.parts[q]?.kind === "body").map((q) => bodyLabel(scene, q));
    return `${m.mode.replace(/([A-Z])/g, " $1").toLowerCase()}${bodies.length === 2 ? ` between ${bodies[0]} and ${bodies[1]}` : ""}`;
  });
  return `${change[0]!.toUpperCase()}${change.slice(1)} would leave these standing mates unable to hold at once: ${names.join("; ")}. Take one of them away or change it first, or change something else`;
};
function standingFixes(h: History): { fixes: Command[]; atOdds: string[] } {
  // all the standing mates solved together first (`in_329`); the ones put back one at a time (`in_321`) only if that did not hold
  const sol = solveStanding(h.scene);
  if (sol.atOdds.length) return { fixes: [], atOdds: sol.atOdds };
  if (sol.commands.length) {
    const batch: Command = { type: "batch", commands: sol.commands };
    const r = exec(h, batch);
    if (r.ok && !mateStatus(r.value.scene).some((m) => m.standing && m.state === "off")) return { fixes: [batch], atOdds: [] };
  }
  const out: Command[] = [];
  let cur = h;
  for (let k = 0; k < 8; k++) {
    const back = putMatesBack(cur.scene, undefined, true);
    if (!back) break;
    const r = exec(cur, back.command);
    if (!r.ok) return { fixes: [], atOdds: [] };
    out.push(back.command);
    cur = r.value;
  }
  return { fixes: putMatesBack(cur.scene, undefined, true) ? [] : out, atOdds: [] };
}
/**
 * Do a command. A command that cannot be done is refused and changes nothing: its reason is in `message`; and one that cannot be done without breaking constraints that were
 * holding says which (`conflict`): the ones it tried to change, and the ones it would have broken, so the view can show them.
 */
/** The ids of the steps a command adds. */
const stepsOf = (c: Command): string[] => (c.type === "addStep" ? [c.step.id] : c.type === "batch" ? c.commands.flatMap(stepsOf) : []);

/** What flashes red when a step is refused and no constraint is to blame: the parts of the step the kernel found cannot take it (the edges of a fillet or chamfer), else all of its parts (`in_266`). */
function stepProblem(before: Session, after: Session, stepId: string): { culprits: string[]; victims: string[]; parts: string[] } | null {
  const st = after.history.scene.steps.find((x) => x.id === stepId) ?? before.history.scene.steps.find((x) => x.id === stepId);
  if (st?.type !== "edgeMod") return null;
  const parts = after.outcome.problems?.[stepId] ?? st.parts;
  return parts.length ? { culprits: [], victims: [], parts: [...parts] } : null;
}
export function run(s: Session, c: Command, opts: { watchAll?: boolean; fallback?: Command } = {}): Session {
  // `watchAll`: the command changes a step already in the history, so any step after it may stop working: those that worked before are watched too
  const steps = opts.watchAll ? s.history.scene.steps.map((x) => x.id).filter((id) => !s.outcome.errors[id]) : stepsOf(c);
  // a step is built on what is shown: while the kernel is still answering for the last change what is shown is the older model, and a step made now could mean something else (`in_142`)
  if (steps.length && !opts.watchAll && s.outcome.kernel?.stale) return { ...s, message: "the model is still being worked out: try again in a moment" };
  const r = exec(s.history, describedCommand(s.history.scene, c)); // (a relation to a part of the body is saved with its description, `in_316`)
  if (!r.ok) return { ...s, message: r.error };
  const next = withHistory(s, r.value);
  // a step the kernel cannot make is refused, not kept to break the steps after it
  const failed = next.outcome.kernel?.stale ? undefined : steps.find((id) => next.outcome.errors[id]);
  if (failed) {
    // the steps could not take it: the constraints that hold the parts it changes are shown, as for any other change that is refused (`in_210`)
    const changed = new Set(partsOf(c));
    for (const q of [...changed]) { const l = s.history.scene.parts[q]; if (l?.kind === "line") [l.a, l.b, ...(l.center ? [l.center] : [])].forEach((e) => changed.add(e)); } // (a line is held by what holds its ends)
    const own = relationsOf(c);
    const culprits = s.history.scene.relations.filter((rel) => !own.includes(rel.id) && rel.locked !== false && rel.kind !== "arcEnds" && rel.parts.some((q) => changed.has(q))).map((rel) => rel.id);
    return { ...s, message: opts.watchAll ? `that would break a step made from it (${next.outcome.errors[failed] ?? "it could not be made"})` : next.outcome.errors[failed] ?? "that could not be made", conflict: culprits.length ? { culprits, victims: [] } : stepProblem(s, next, failed) ?? s.conflict };
  }
  const before = conflictsOf(s.outcome);
  const after = conflictsOf(next.outcome);
  const fresh = after.planes.filter((p) => !before.planes.includes(p));
  if (fresh.length) {
    const culprits = relationsOf(c);
    const victims = after.ids.filter((id) => !culprits.includes(id) && !before.ids.includes(id));
    return { ...s, message: "that cannot be done without breaking other constraints", conflict: { culprits, victims } };
  }
  // a constraint to an edge of the body that the change took away, with no edge that looks like it: said, and the constraint flashes; the change stays (`in_309`)
  const lost = (next.outcome.lost ?? []).filter((id) => !(s.outcome.lost ?? []).includes(id));
  if (lost.length) return { ...next, message: `a constraint to an edge of the body has lost it (${lost.join(", ")}): no edge looks like it now; it holds nothing until the body is as it was`, conflict: { culprits: lost, victims: [] } };
  let odds: string[] = []; // (the standing mates that cannot all hold, `in_329`)
  // standing mates (`in_321`): the ones the change broke are put back in the same step, so one undo takes back the change and the corrections together
  if (!next.outcome.kernel?.stale) {
    const { fixes, atOdds } = standingFixes(next.history);
    odds = atOdds;
    // a change that leaves mates that held with no placement where they all hold is refused, as one that breaks sketch constraints is: the mates are named and nothing is made (`in_330`, `in_331`); a conflict that was already there is not the change's
    const held = new Set(mateStatus(s.history.scene).filter((m) => m.state === "ok").map((m) => m.id));
    const brought = atOdds.filter((id) => held.has(id) || !s.history.scene.relations.some((r) => r.id === id));
    if (brought.length) return { ...s, message: atOddsMessage(next.history.scene, atOdds, changeWords(s.history.scene, c)), conflict: { culprits: [], victims: atOdds } };
    if (fixes.length) {
      const again = exec(s.history, { type: "batch", commands: [describedCommand(s.history.scene, c), ...fixes] });
      if (again.ok) return { ...withHistory(s, again.value), conflict: null, message: "the standing mates were put back with the change" };
    }
  }
  // a mate (`in_315`) that was true and is not any more after this change: said, so it can be put back from the menu; the change stays
  const wasOff = new Set(mateStatus(s.history.scene).filter((m) => m.state !== "ok").map((m) => m.id));
  // (while the kernel is still answering the faces are the older ones, and a mate just made would read as not true: said only when the answer is there)
  const nowOff = next.outcome.kernel?.stale ? [] : mateStatus(next.history.scene).filter((m) => m.state !== "ok" && !wasOff.has(m.id));
  if (odds.length) return { ...next, conflict: null, message: atOddsMessage(next.history.scene, odds, changeWords(s.history.scene, c)) };
  if (nowOff.length) return { ...next, conflict: null, message: `${nowOff.length === 1 ? "a mate is" : `${nowOff.length} mates are`} no longer true (${nowOff.map((m) => m.state === "lost" ? "a face is gone" : "the bodies have come apart").join(", ")}): "Put the mates back" in the ⋯ menu makes them again` };
  const late = !!next.outcome.kernel?.stale && steps.length > 0;
  return { ...next, conflict: null, checkSteps: late ? steps : undefined, fallback: late ? opts.fallback : undefined };
}
/** The same history compiled again (the kernel's worker has an answer that was not there when the history was last compiled). */
export function refresh(s: Session): Session {
  const h = s.history;
  const scene = h.derive(h.scene); // the same scene derived again: the body parts come from the kernel's newest answer
  const snapshots = [...h.snapshots];
  snapshots[h.cursor] = scene;
  const now = withHistory(s, { ...h, scene, snapshots }, s.message);
  // the answer for the last step has come and it could not be made: it is taken back (it was shown before the answer came), and the reason says why
  const failed = !now.outcome.kernel?.stale ? (s.checkSteps ?? []).find((id) => now.outcome.errors[id]) : undefined;
  if (failed) {
    const back = refresh({ ...withHistory(s, undo(h)), checkSteps: undefined, fallback: undefined });
    if (s.fallback) {
      const made = run(back, s.fallback);
      if (!made.message) return { ...made, message: "the step that made this face could not take that size: a push / pull was added instead" };
    }
    return { ...back, message: now.outcome.errors[failed] ?? "that could not be made", conflict: stepProblem(back, now, failed) ?? back.conflict };
  }
  const fresh = !now.outcome.kernel?.stale;
  // the answer has come for a change made while it was awaited (the browser): the standing mates it broke are put back now, in the same step as the change (`in_321`, `in_328`: they were not before)
  if (fresh && s.outcome.kernel?.stale && h.cursor === h.commands.length && h.cursor > 0) {
    const { fixes, atOdds } = standingFixes(now.history);
    if (fixes.length) {
      const again = exec(undo(now.history), { type: "batch", commands: [h.commands[h.cursor - 1]!, ...fixes] });
      if (again.ok) return { ...withHistory(now, again.value), checkSteps: undefined, fallback: undefined, message: "the standing mates were put back with the change" };
    }
    // the answer shows the change leaves mates that held with no placement where they all hold: it is taken back, as when it is made with the answer at hand (`in_331`)
    const held = new Set(mateStatus(h.snapshots[h.cursor - 1] ?? h.base).filter((m) => m.state === "ok").map((m) => m.id));
    if (atOdds.some((id) => held.has(id) || !(h.snapshots[h.cursor - 1] ?? h.base).relations.some((r) => r.id === id))) {
      const undone = undo(h);
      const back = withHistory(s, { ...undone, commands: undone.commands.slice(0, undone.cursor), snapshots: undone.snapshots.slice(0, undone.cursor + 1) }); // (taken back, not kept to be done again with redo)
      return { ...back, checkSteps: undefined, fallback: undefined, message: atOddsMessage(now.history.scene, atOdds, changeWords(h.snapshots[h.cursor - 1] ?? h.base, h.commands[h.cursor - 1]!)), conflict: { culprits: [], victims: atOdds } };
    }
  }
  // and a mate that is not true now, with nothing said when the change was made (the answer was awaited): said once the answer is here
  const off = fresh && s.outcome.kernel?.stale && !now.message ? mateStatus(now.history.scene).filter((m) => m.state !== "ok" && m.standing) : []; // (a standing one the change broke and nothing could put back: the others were left off knowingly)
  const said = off.length ? `${off.length === 1 ? "a mate is" : `${off.length} mates are`} not true and could not be put back with the change (it may be at odds with another mate, or a face is gone)` : now.message;
  return { ...now, message: said, checkSteps: now.outcome.kernel?.stale ? s.checkSteps : undefined, fallback: now.outcome.kernel?.stale ? s.fallback : undefined };
}
export const undoLast = (s: Session): Session => { const n = withHistory(s, undo(s.history)); return s.lagging ? refresh(n) : n; };
export const redoLast = (s: Session): Session => { const n = withHistory(s, redo(s.history)); return s.lagging ? refresh(n) : n; };

/** A click on the candidates under the pointer (see `picking.refsAt`). */
export function clickOn(s: Session, candidates: readonly Ref[], shift = false): Session {
  const sc = s.history.scene;
  // a click on a member of a group that is selected goes one level in (`in_257`)
  const first = candidates[0];
  const inner = !shift && first ? goIn(sc, s.click.selection, first) : null;
  if (inner) return { ...s, click: { ...s.click, selection: inner, spot: "" }, message: null };
  const r = clickGrammar(s.click, candidates, { shift });
  return { ...s, click: { ...r.state, selection: afterClick(sc, s.click.selection, r.state.selection) }, message: r.cycled ? `${r.cycled.index} of ${r.cycled.of} here` : null };
}
export const hoverOn = (s: Session, ref: Ref | undefined): Session => (s.hover === ref ? s : { ...s, hover: ref });
export const clearSelection = (s: Session): Session => ({ ...s, click: initialClick(), message: null });

/** What the scene would be if this command were done (not done): the compiled scene and its outcome, or null if the command is refused. Used to show an operation's real result while its number is set. */
export function previewCommand(s: Session, c: Command): { scene: Scene; outcome: CompileOutcome } | null {
  const r = exec(s.history, c);
  return r.ok ? { scene: r.value.scene, outcome: s.outcomeOf(r.value) } : null;
}
