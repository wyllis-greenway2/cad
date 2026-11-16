// The settings page's logic (`dec_settings_page`, `in_543`): which actions have keys and what they are called, turning a key press into the text of a binding ("mod+shift+z") and back into words,
// changing a binding without two actions sharing one, and keeping the person's own bindings. Pure: no DOM.
import type { Mods } from "../shared/input.ts";

export type Keys = Record<string, string[]>;
/** Every action the keyboard can start (the ones `input/keys.ts` knows), in the order the page lists them, with its name there. Those with no key at first are for the person to give one. */
export const KEY_ACTIONS: { id: string; label: string; group: string }[] = [
  { id: "undo", label: "Undo", group: "Edit" }, { id: "redo", label: "Redo", group: "Edit" }, { id: "delete", label: "Delete", group: "Edit" },
  { id: "copy", label: "Copy", group: "Edit" }, { id: "paste", label: "Paste", group: "Edit" }, { id: "group", label: "Group", group: "Edit" }, { id: "ungroup", label: "Ungroup", group: "Edit" },
  { id: "cancel", label: "Cancel / close", group: "Edit" },
  { id: "save", label: "Save", group: "File" }, { id: "open", label: "Open", group: "File" },
  { id: "toolRect", label: "Rectangle", group: "Sketch" }, { id: "toolCircle", label: "Circle", group: "Sketch" }, { id: "toolLine", label: "Line", group: "Sketch" }, { id: "dimension", label: "Dimension", group: "Sketch" },
  { id: "extrude", label: "Push pull", group: "Shape" }, { id: "edge", label: "Fillet chamfer", group: "Shape" }, { id: "move", label: "Move", group: "Shape" }, { id: "rotate", label: "Rotate", group: "Shape" }, { id: "scale", label: "Scale", group: "Shape" },
  { id: "home", label: "Home view", group: "View" }, { id: "lookX", label: "Look along X", group: "View" }, { id: "lookY", label: "Look along Y", group: "View" }, { id: "lookZ", label: "Look along Z", group: "View" }, { id: "lookN", label: "Look at the selection", group: "View" },
];
export const KEY_GROUPS = [...new Set(KEY_ACTIONS.map((a) => a.group))];

/** Keys that are not for binding: numbers are typed into a bubble, Tab, Enter, the arrows and Space belong to typing and to the view, and a lone modifier is no key. */
const RESERVED = /^([0-9.\-]|Tab|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Shift|Control|Alt|Meta| |Dead|Unidentified)$/;
/** The binding a key press makes ("mod+shift+z": mod is Ctrl or Cmd), or why it cannot be one. */
export function chordOf(key: string, mods: Mods): { ok: true; spec: string } | { ok: false; why: string } {
  if (RESERVED.test(key)) return { ok: false, why: /^[0-9.\-]$/.test(key) ? "numbers are typed into the bubbles" : /^(Shift|Control|Alt|Meta)$/.test(key) ? "press a key with it" : "that key is kept for typing and moving the view" };
  const k = key.toLowerCase();
  if (/^[wasd]$/.test(k) && !mods.ctrl && !mods.alt) return { ok: false, why: "W A S D fly the view in game mode" };
  return { ok: true, spec: `${mods.ctrl ? "mod+" : ""}${mods.shift ? "shift+" : ""}${mods.alt ? "alt+" : ""}${k}` };
}
const NAMES: Record<string, string> = { escape: "Esc", delete: "Delete", backspace: "Backspace", " ": "Space", mod: "Ctrl" };
/** A binding as it is read on the page: "mod+shift+z" is "Ctrl+Shift+Z". */
export const specText = (spec: string): string => spec.split("+").map((p) => NAMES[p] ?? (p.length === 1 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1))).join("+");
const norm = (spec: string): string => { const p = spec.toLowerCase().split("+"); const key = p[p.length - 1]!; return `${p.includes("mod") ? "mod+" : ""}${p.includes("shift") ? "shift+" : ""}${p.includes("alt") ? "alt+" : ""}${key}`; };

/** Which action already has this binding (other than `except`), or null. */
export const takenBy = (keys: Keys, spec: string, except: string): string | null => Object.entries(keys).find(([a, l]) => a !== except && l.some((s) => norm(s) === norm(spec)))?.[0] ?? null;

/** Give `action` a binding in place of the one it has at `index` (or as one more when `index` is past the end). A binding another action has is taken from it (the page says so). */
export function rebind(keys: Keys, action: string, index: number, spec: string): { keys: Keys; tookFrom: string | null } {
  const tookFrom = takenBy(keys, spec, action);
  const out: Keys = Object.fromEntries(Object.entries(keys).map(([a, l]) => [a, a === tookFrom ? l.filter((s) => norm(s) !== norm(spec)) : [...l]]));
  const mine = out[action] ?? [];
  if (index < mine.length) mine[index] = spec; else if (!mine.some((s) => norm(s) === norm(spec))) mine.push(spec);
  out[action] = [...new Set(mine.map(norm))];
  return { keys: out, tookFrom };
}
/** `action` without the binding at `index`. */
export const unbind = (keys: Keys, action: string, index: number): Keys => ({ ...keys, [action]: (keys[action] ?? []).filter((_, i) => i !== index) });

/** What is kept: only the bindings that differ from the usual ones, so a key the app gives later is not hidden by an old copy. */
export const keysToText = (keys: Keys, usual: Keys): string => JSON.stringify(Object.fromEntries(Object.entries(keys).filter(([a, l]) => JSON.stringify(l) !== JSON.stringify(usual[a] ?? []))));
/** The usual bindings with the kept ones on top (anything unreadable is ignored). */
export function keysFromText(text: string | null, usual: Keys): Keys {
  const out: Keys = Object.fromEntries(Object.entries(usual).map(([a, l]) => [a, [...l]]));
  try {
    const kept = JSON.parse(text ?? "{}") as Record<string, unknown>;
    for (const [a, l] of Object.entries(kept)) if (KEY_ACTIONS.some((x) => x.id === a) && Array.isArray(l) && l.every((s) => typeof s === "string")) out[a] = l as string[];
  } catch { /* not readable: the usual */ }
  return out;
}
