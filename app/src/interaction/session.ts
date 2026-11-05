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
}
export const scene = (s: Session): Scene => s.history.scene;
export const selection = (s: Session): Selection => s.click.selection;

export function createSession(kernel: Kernel, base: Scene = emptyScene()): Session {
  // the outcome of the latest derive is kept beside the history, so the view can show errors and the kernel result without compiling twice
  const cache = new Map<Scene, CompileOutcome>();
  const derive = (sc: Scene): Scene => {
    const o = compile(sc, kernel);
    cache.set(o.scene, o);
    return o.scene;
  };
  const history = newHistory(base, derive);
  const outcomeOf = (h: History): CompileOutcome => cache.get(h.scene)!;
  return { history, click: initialClick(), hover: undefined, outcome: outcomeOf(history), message: null, outcomeOf };
}
function withHistory(s: Session, h: History, message: string | null = null): Session {
  // the selection keeps only parts that still exist
  return { ...s, history: h, outcome: s.outcomeOf(h), message, click: { ...s.click, selection: s.click.selection.filter((r) => r in h.scene.parts) } };
}

/** Do a command. A refused command changes nothing and leaves its reason in `message`. */
export function run(s: Session, c: Command): Session {
  const r = exec(s.history, c);
  return r.ok ? withHistory(s, r.value) : { ...s, message: r.error };
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
