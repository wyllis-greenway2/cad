// The project file (`prin_graph_is_truth`, `prin_history_additive`): the base scene and the list of commands with the cursor; body parts and derived faces are not saved,
// they are rebuilt. Opening replays the commands, so undo works after opening. Plain JSON, one version number.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, SceneJson } from "./scene.ts";
import { toJSON, fromJSON } from "./scene.ts";
import type { Command } from "./commands.ts";
import type { History } from "./history.ts";
import { replay } from "./history.ts";

export interface ProjectFile {
  format: "cad-project";
  version: 1;
  base: SceneJson;
  commands: Command[];
  cursor: number;
}

export const toFile = (h: History): ProjectFile => ({ format: "cad-project", version: 1, base: toJSON(h.base), commands: [...h.commands], cursor: h.cursor });

/** Read a project from text, replaying its commands through `derive` (the compiler). A file that is not ours, or does not replay, is refused with the reason. */
export function fromText(text: string, derive: (s: Scene) => Scene): Result<History> {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return err("this is not a project file (not valid JSON)");
  }
  const f = j as Partial<ProjectFile> | null;
  if (!f || f.format !== "cad-project") return err("this is not a project file");
  if (f.version !== 1) return err(`this project file is from a newer version (${String(f.version)})`);
  if (!f.base || !Array.isArray(f.commands) || typeof f.cursor !== "number") return err("this project file is damaged");
  let base: Scene;
  try {
    base = fromJSON(f.base);
  } catch (e) {
    return err(`this project file is damaged: ${String((e as Error).message)}`);
  }
  const r = replay(base, f.commands, f.cursor, derive);
  return r.ok ? ok(r.value) : err(`this project file does not replay: ${r.error}`);
}
export const toText = (h: History): string => JSON.stringify(toFile(h));
