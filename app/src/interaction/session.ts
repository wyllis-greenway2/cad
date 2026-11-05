// A session: the history of the scene (every scene already compiled: solved, with body parts and derived faces), the selection, and what the pointer is over.
// This is the one object the app holds. Commands are checked against the whole scene, so a relation to a body corner or a drawing on a body face is valid
// (the gap noted in Handoff 084).
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
  /** the last command that was refused because it could not be done without breaking constraints: who tried (`culprits`: relation ids) and what it would have broken (`victims`) */
  readonly conflict: { culprits: string[]; victims: string[] } | null;
}
export const scene = (s: Session): Scene => s.history.scene;
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
const wrap = (history: History, outcomeOf: (h: History) => CompileOutcome): Session => ({ history, click: initialClick(), hover: undefined, outcome: outcomeOf(history), message: null, outcomeOf, conflict: null });

export function createSession(kernel: Kernel, base: Scene = emptyScene()): Session {
  const c = makeCompiler(kernel);
  return wrap(newHistory(base, c.derive), c.outcomeOf);
}
/** A session from the text of a project file (see `operation/file.ts`), or why it cannot be opened. */
export function openSession(kernel: Kernel, text: string): Result<Session> {
  const c = makeCompiler(kernel);
  const h = fromText(text, c.derive);
  return h.ok ? ok(wrap(h.value, c.outcomeOf)) : h;
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
const conflictsOf = (o: CompileOutcome): { planes: string[]; ids: string[] } => ({
  planes: o.solve.planes.filter((p) => p.status === "conflict").map((p) => p.plane),
  ids: o.solve.planes.flatMap((p) => p.conflicts),
});

/**
 * Do a command. A command that cannot be done is refused and changes nothing: its reason is in `message`; and one that cannot be done without breaking constraints that were
 * holding says which (`conflict`): the ones it tried to change, and the ones it would have broken, so the view can show them.
 */
export function run(s: Session, c: Command): Session {
  const r = exec(s.history, c);
  if (!r.ok) return { ...s, message: r.error };
  const next = withHistory(s, r.value);
  const before = conflictsOf(s.outcome);
  const after = conflictsOf(next.outcome);
  const fresh = after.planes.filter((p) => !before.planes.includes(p));
  if (fresh.length) {
    const culprits = relationsOf(c);
    const victims = after.ids.filter((id) => !culprits.includes(id) && !before.ids.includes(id));
    return { ...s, message: "that cannot be done without breaking other constraints", conflict: { culprits, victims } };
  }
  return { ...next, conflict: null };
}
export const undoLast = (s: Session): Session => withHistory(s, undo(s.history));
export const redoLast = (s: Session): Session => withHistory(s, redo(s.history));

/** A click on the candidates under the pointer (see `picking.refsAt`). */
export function clickOn(s: Session, candidates: readonly Ref[], shift = false): Session {
  const r = clickGrammar(s.click, candidates, { shift });
  return { ...s, click: r.state, message: r.cycled ? `${r.cycled.index} of ${r.cycled.of} here` : null };
}
export const hoverOn = (s: Session, ref: Ref | undefined): Session => (s.hover === ref ? s : { ...s, hover: ref });
export const clearSelection = (s: Session): Session => ({ ...s, click: initialClick(), message: null });

/** What the scene would be if this command were done (not done): the compiled scene and its outcome, or null if the command is refused. Used to show an operation's real result while its number is set. */
export function previewCommand(s: Session, c: Command): { scene: Scene; outcome: CompileOutcome } | null {
  const r = exec(s.history, c);
  return r.ok ? { scene: r.value.scene, outcome: s.outcomeOf(r.value) } : null;
}
