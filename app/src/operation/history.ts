// Undo and redo: a cursor over a list of commands. The scene at the cursor is the base scene with the commands up to the cursor applied
// (blueprint section 8: "append-only with a cursor"). Doing something after an undo drops the undone tail, as usual.
import type { Result } from "../shared/result.ts";
import { ok } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import { emptyScene } from "./scene.ts";
import type { Command } from "./commands.ts";
import { apply } from "./commands.ts";

export interface History {
  readonly base: Scene;
  readonly commands: readonly Command[];
  readonly cursor: number;
  /** The scene at the cursor (kept so reading it is free). */
  readonly scene: Scene;
  /** Scenes after each command so far (index i = after the first i commands), so undo and redo do not replay. */
  readonly snapshots: readonly Scene[];
}

export const newHistory = (base: Scene = emptyScene()): History => ({ base, commands: [], cursor: 0, scene: base, snapshots: [base] });

export function exec(h: History, c: Command): Result<History> {
  const r = apply(h.scene, c);
  if (!r.ok) return r;
  return ok({
    base: h.base,
    commands: [...h.commands.slice(0, h.cursor), c],
    cursor: h.cursor + 1,
    scene: r.value,
    snapshots: [...h.snapshots.slice(0, h.cursor + 1), r.value],
  });
}
export const canUndo = (h: History) => h.cursor > 0;
export const canRedo = (h: History) => h.cursor < h.commands.length;
export const undo = (h: History): History => (canUndo(h) ? { ...h, cursor: h.cursor - 1, scene: h.snapshots[h.cursor - 1] ?? h.base } : h);
export const redo = (h: History): History => (canRedo(h) ? { ...h, cursor: h.cursor + 1, scene: h.snapshots[h.cursor + 1] ?? h.scene } : h);

/** Rebuild a history from its saved commands (the file format stores the base and the command list). */
export function replay(base: Scene, commands: readonly Command[], cursor = commands.length): Result<History> {
  let h = newHistory(base);
  for (const c of commands) {
    const r = exec(h, c);
    if (!r.ok) return r;
    h = r.value;
  }
  let cur = h;
  while (cur.cursor > cursor) cur = undo(cur);
  return ok(cur);
}
