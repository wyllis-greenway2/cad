// Keys: the keymap (settings) turns a press into an intent; digits, ".", "-", Backspace, Tab, Enter and the arrows are typed into the number being entered.
import type { Intent, RawInput } from "../../shared/input.ts";
import type { settings } from "../../shared/settings.ts";
import { keyAction } from "../keymap.ts";

type Key = Extract<RawInput, { kind: "key" }>;
const BEGIN = { toolRect: "rect", toolCircle: "circle", toolLine: "line", extrude: "extrude", edge: "edge", move: "move", rotate: "rotate", scale: "scale", dimension: "dimension" } as const;
const PLAIN = new Set(["undo", "redo", "home", "delete", "save", "open", "group", "ungroup"]);
const LOOK = { lookX: "X", lookY: "Y", lookZ: "Z", lookN: "N" } as const;

/** The intents for a key going down (a release or Space is the caller's business). */
export function keyIntents(e: Key, I: typeof settings.input): Intent[] {
  const a = keyAction(e.key, e.mods, I.keys);
  const typing = !e.mods.ctrl && !e.mods.alt && /^([0-9.\-]|Backspace|Tab|Enter|ArrowUp|ArrowDown)$/.test(e.key);
  if (typing) return [...(e.key === "Backspace" && a === "delete" ? [{ type: "delete" } as Intent] : []), { type: "typed", key: e.key, shift: e.mods.shift }];
  if (!a) return [];
  if (PLAIN.has(a)) return [{ type: a } as Intent];
  if (a === "cancel") return [{ type: "escape" }];
  if (a in LOOK) return [{ type: "look", plane: LOOK[a as keyof typeof LOOK] }];
  if (a in BEGIN) return [{ type: "begin", name: BEGIN[a as keyof typeof BEGIN] }];
  return [];
}
