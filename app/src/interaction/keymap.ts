// Which key means which action: data in settings.input.keys, parsed here (ported from the prototype's keymap.mjs). No DOM.
import type { Mods } from "../shared/input.ts";

interface KeyChord { key: string; mod: boolean; shift: boolean; alt: boolean }
/** Parse "mod+shift+z": mod = Ctrl on Windows and Linux, Cmd on Mac (either works). */
function parseKey(spec: string): KeyChord {
  const parts = spec.toLowerCase().split("+");
  return { key: parts[parts.length - 1]!, mod: parts.includes("mod"), shift: parts.includes("shift"), alt: parts.includes("alt") };
}
const matchKey = (key: string, mods: Mods, spec: string): boolean => {
  const k = parseKey(spec);
  return key.toLowerCase() === k.key && mods.ctrl === k.mod && mods.shift === k.shift && mods.alt === k.alt;
};
/** The action for a key press, or null. */
export function keyAction(key: string, mods: Mods, keys: Record<string, string[]>): string | null {
  for (const [action, specs] of Object.entries(keys)) if (specs.some((s) => matchKey(key, mods, s))) return action;
  return null;
}
