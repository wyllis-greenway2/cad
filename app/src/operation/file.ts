// The project file (`prin_graph_is_truth`, `prin_history_additive`): the base scene and the list of commands with the cursor; body parts and derived faces are not saved,
// they are rebuilt. Opening replays the commands, so undo works after opening. Plain JSON, one version number.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, SceneJson } from "./scene.ts";
import { toJSON, fromJSON } from "./scene.ts";
import type { Command } from "./commands.ts";
import type { History } from "./history.ts";
import { replay } from "./history.ts";

/** What made a project file (`dec_import_export_menu`, `in_494`): the app, which build of it, and when it was saved, at the top of the file so a project sent with a bug report says what it came from. Nothing reads it back but the person (and the message on opening). */
export interface About { app: string; build: string; saved: string }
export interface ProjectFile {
  format: "cad-project";
  version: 1;
  about?: About;
  base: SceneJson;
  commands: Command[];
  cursor: number;
}

const toFile = (h: History, about?: About): ProjectFile => ({ format: "cad-project", version: 1, ...(about ? { about } : {}), base: toJSON(h.base), commands: [...h.commands], cursor: h.cursor });

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
export const toText = (h: History, about?: About): string => JSON.stringify(toFile(h, about));

/** The `about` block of a project file's text, or null when it has none (a file saved before it) or is not a project. */
export function aboutOf(text: string): About | null {
  try {
    const a = (JSON.parse(text) as { about?: Partial<About> } | null)?.about;
    return a && typeof a.app === "string" && typeof a.build === "string" && typeof a.saved === "string" ? { app: a.app, build: a.build, saved: a.saved } : null;
  } catch { return null; }
}
