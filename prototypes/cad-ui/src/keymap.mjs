// Pure input mapping (no DOM): which mouse gesture means orbit / pan, and which key means which action.
// All of it is data in settings.input, so presets and remapping need no code changes.

const modsOf = (b) => ({ shift: !!b.shift, ctrl: !!b.ctrl, alt: !!b.alt });

/** Does a pointer/wheel event match a mouse binding {button, shift?, ctrl?, alt?}? Modifiers must match exactly. */
export function matchMouse(ev, b) {
  const m = modsOf(b);
  return ev.button === b.button && !!ev.shiftKey === m.shift && !!(ev.ctrlKey || ev.metaKey) === m.ctrl && !!ev.altKey === m.alt;
}

/** "orbit" | "pan" | null for a pointerdown event under a navigation preset. */
export function navAction(ev, preset) {
  for (const action of ["orbit", "pan"]) if ((preset[action] ?? []).some((b) => matchMouse(ev, b))) return action;
  return null;
}

/** Parse "mod+shift+z" into {key, mod, shift, alt}. mod = Ctrl on Windows/Linux, Cmd on Mac (either works). */
export function parseKey(spec) {
  const parts = spec.toLowerCase().split("+");
  return { key: parts[parts.length - 1], mod: parts.includes("mod"), shift: parts.includes("shift"), alt: parts.includes("alt") };
}

export function matchKey(ev, spec) {
  const k = parseKey(spec);
  const key = ev.key.toLowerCase();
  const mod = !!(ev.ctrlKey || ev.metaKey);
  // letters: Shift changes ev.key's case only, so compare lowercase; require the exact modifier set
  return key === k.key && mod === k.mod && !!ev.shiftKey === k.shift && !!ev.altKey === k.alt;
}

/** Name of the action for a keyboard event, or null. keys: { action: "spec" | ["spec", ...] } */
export function keyAction(ev, keys) {
  for (const [action, specs] of Object.entries(keys)) if ([].concat(specs).some((s) => matchKey(ev, s))) return action;
  return null;
}
