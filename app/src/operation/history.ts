// Undo and redo: a cursor over a list of commands. The scene at the cursor is the base scene with the commands up to the cursor applied
// (blueprint section 8: "append-only with a cursor"). Doing something after an undo drops the undone tail, as usual.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import type { Part } from "./part.ts";
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
  /** Applied to every scene after a command (the compiler: solve, body parts, derived faces), so commands always see the whole scene. Must be deterministic. */
  readonly derive: (s: Scene) => Scene;
  /** what is done at an earlier cursor goes in at the cursor and the steps after it are made again, instead of dropping them (`dec_insert_step`); only while the cursor is before the end */
  readonly inserting?: boolean;
}

/**
 * How many of the latest snapshots are kept whole. The older ones lose their body parts (the faces, edges and corners of the kernel's answer: most of a scene, and each snapshot had its own): a model of a hundred parts held
 * 385 MB of scenes (175 parts, a gigabyte), growing as the square of the steps. Going back to one makes its bodies again from the kernel (`sceneAt`), as the kernel keeps its answers for the graphs it has seen (`in_899`).
 */
const KEEP_WHOLE = 30;
const lean = (s: Scene): Scene => {
  if (s.lean) return s;
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.origin !== "body") parts[p.ref] = p;
  return { ...s, parts, lean: true };
};
/**
 * The most parts the whole snapshots may hold together (`in_997`): thirty whole snapshots of a scene of a hundred thousand parts (ten spur gears: 290 faces each) were 400 MB, and thirty gears 1.7 GB; the newest two are always whole,
 * and the others while they are within the number of snapshots and of parts.
 */
let WHOLE_PARTS = 150000;
/** (for tests) the budget of parts for the whole snapshots */
export function setWholeBudget(n: number): void { WHOLE_PARTS = n; }
const partsKept = new WeakMap<Scene, number>();
const partsIn = (s: Scene): number => { let n = partsKept.get(s); if (n === undefined) { n = Object.keys(s.parts).length; partsKept.set(s, n); } return n; };
/** The snapshots with the ones that have left the whole ones (by their number or by the parts they hold) made lean. */
const thin = (snapshots: readonly Scene[]): Scene[] => {
  const out = [...snapshots];
  let held = 0;
  for (let i = out.length - 1; i > 0; i--) {
    const sc = out[i]!;
    if (sc.lean) break; // (all the older ones are lean already)
    const fromEnd = out.length - 1 - i;
    held += partsIn(sc);
    if (fromEnd >= 2 && (fromEnd > KEEP_WHOLE || held > WHOLE_PARTS)) out[i] = lean(sc);
  }
  return out;
};
/** The scene after the first `i` commands, whole: a lean one has its body parts made again. */
export function sceneAt(h: History, i: number): Scene {
  const kept = h.snapshots[i] ?? h.base;
  if (!kept.lean) return kept;
  const { lean: _l, ...rest } = h.derive(kept) as Scene & { lean?: boolean };
  return rest as Scene;
}
/** The scene kept for a cursor; while inserting, with the counter of the whole history, so what is made there gets ids no later step has (`dec_insert_step`). */
function shown(h: History, scene: Scene): Scene {
  if (!h.inserting) return scene;
  const end = h.snapshots[h.commands.length]?.counter ?? scene.counter;
  return end > scene.counter ? h.derive({ ...scene, counter: end }) : scene; // (derived: the compile result is kept by the scene it was made for)
}

export function newHistory(base: Scene = emptyScene(), derive: (s: Scene) => Scene = (s) => s): History {
  const first = derive(base);
  return { base, commands: [], cursor: 0, scene: first, snapshots: [first], derive };
}

/** A command done at an earlier cursor, put in at the cursor with the commands after it made again on top of it (`dec_insert_step`). Refused, nothing changed, if one of them cannot be made again. */
function insertExec(h: History, c: Command): Result<History> {
  const tail = h.commands.slice(h.cursor);
  const first = apply(h.scene, c);
  if (!first.ok) return first;
  let scene = h.derive(first.value);
  const snapshots = [...h.snapshots.slice(0, h.cursor + 1), scene];
  for (let i = 0; i < tail.length; i++) {
    const r = apply(scene, tail[i]!);
    if (!r.ok) return err(`the steps after this one could not be made again (${r.error})`);
    scene = h.derive(r.value);
    snapshots.push(scene);
  }
  const thinned = thin(snapshots);
  const here = { ...h, commands: [...h.commands.slice(0, h.cursor), c, ...tail], snapshots: thinned, cursor: h.cursor + 1 };
  return ok({ ...here, scene: shown(here, sceneAt(here, h.cursor + 1)) });
}

export function exec(h: History, c: Command): Result<History> {
  if (h.inserting && h.cursor < h.commands.length) return insertExec(h, c);
  const r = apply(h.scene, c);
  if (!r.ok) return r;
  const scene = h.derive(r.value);
  return ok({
    derive: h.derive,
    base: h.base,
    commands: [...h.commands.slice(0, h.cursor), c],
    cursor: h.cursor + 1,
    scene,
    snapshots: thin([...h.snapshots.slice(0, h.cursor + 1), scene]),
  });
}
/** Turn inserting on or off (only before the end of the history: at the end every step is added there anyway). */
export function toggleInsert(h: History): History {
  if (h.cursor >= h.commands.length) return h.inserting ? { ...h, inserting: false } : h;
  const on = !h.inserting;
  const next = { ...h, inserting: on };
  return { ...next, scene: shown(next, sceneAt(h, h.cursor)) };
}
export const canUndo = (h: History) => h.cursor > 0;
export const canRedo = (h: History) => h.cursor < h.commands.length;
export const undo = (h: History): History => (canUndo(h) ? { ...h, cursor: h.cursor - 1, scene: shown(h, sceneAt(h, h.cursor - 1)) } : h);
export const redo = (h: History): History => { if (!canRedo(h)) return h; const n = { ...h, cursor: h.cursor + 1, ...(h.cursor + 1 >= h.commands.length ? { inserting: false } : {}) }; return { ...n, scene: shown(n, h.snapshots[h.cursor + 1] ? sceneAt(h, h.cursor + 1) : h.scene) }; };

/** The cursor moved to any point: the scene there is the one kept for it (`dec_history_navigation`); nothing is removed, so redo goes forward again. */
export const goTo = (h: History, cursor: number): History => { const c = Math.max(0, Math.min(h.commands.length, Math.round(cursor))); if (c === h.cursor) return h; const n = { ...h, cursor: c, ...(c >= h.commands.length ? { inserting: false } : {}) }; return { ...n, scene: shown(n, sceneAt(h, c)) }; };

/**
 * Rebuild a history from its saved commands (the file format stores the base and the command list).
 * The scene is derived (solved, its faces found, its bodies asked for) after every command by `exec`, which for a long history is most of the time of opening it (300 parts: 4.4 s, 1000: 33 s, the page frozen): here
 * the commands are applied one after another and the scene is derived only now and then and for the last few (`REPLAY_STEP`, `KEEP_WHOLE`); the snapshots between are lean and are derived when gone back to (`sceneAt`).
 * If a command does not apply to a scene that is not derived (it may name a part only the derivation makes) the whole is done again as it always was, so that nothing is refused that was not refused before (`in_994`).
 */
const REPLAY_STEP = 64;
/** The commands that add what they are given to a scene and read nothing the derivation makes (the faces, the derived lines): a history of nothing else can be applied without deriving after each. A scene derived afresh is not always what one derived step by step is for the others (a fixture's undo gave other faces), so any other command in the history takes the slow way. */
const ADDING = new Set(["addPart", "addRelation", "addStep"]);
const adding = (c: Command): boolean => (c.type === "batch" ? c.commands.every(adding) : ADDING.has(c.type));
export function replay(base: Scene, commands: readonly Command[], cursor = commands.length, derive?: (s: Scene) => Scene, every = REPLAY_STEP): Result<History> {
  if (!derive || commands.length <= every || !commands.every(adding)) return replayEachStep(base, commands, cursor, derive);
  const d = derive;
  const first = newHistory(base, d);
  let scene = first.scene;
  const n = commands.length;
  const snapshots: Scene[] = [scene];
  for (let i = 0; i < n; i++) {
    const r = apply(scene, commands[i]!);
    if (!r.ok) return replayEachStep(base, commands, cursor, derive);
    const whole = i >= n - KEEP_WHOLE - 1, derived = whole || (i + 1) % every === 0;
    scene = derived ? d(r.value) : r.value;
    snapshots.push(whole ? scene : derived ? lean(scene) : { ...scene, lean: true }); // (a scene not derived has no body parts to take out)
  }
  let cur: History = { derive: d, base, commands: [...commands], cursor: n, scene, snapshots: thin(snapshots) };
  while (cur.cursor > cursor) cur = undo(cur);
  return ok(cur);
}
/** Every command made and the scene derived after each: what a history does as it is worked, and what `replay` falls back to. */
export function replayEachStep(base: Scene, commands: readonly Command[], cursor = commands.length, derive?: (s: Scene) => Scene): Result<History> {
  let h = newHistory(base, derive);
  for (const c of commands) {
    const r = exec(h, c);
    if (!r.ok) return r;
    h = r.value;
  }
  let cur = h;
  while (cur.cursor > cursor) cur = undo(cur);
  return ok(cur);
}
