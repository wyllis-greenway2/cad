// The web implementation of the platform's input (`dec_platform_web_portable`): DOM pointer, wheel, gesture and key events become plain RawInput records on the bus.
// It knows nothing about parts, selection or the camera. A desktop or mobile wrapper provides its own version of this file.
import type { Bus } from "../shared/events.ts";
import type { RawInput, Mods, Device } from "../shared/input.ts";

export type InputBus = Bus<{ input: RawInput }>;

const modsOf = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): Mods => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
const deviceOf = (t: string): Device => (t === "touch" ? "touch" : t === "pen" ? "pen" : "mouse");
const TICK_MS = 50;
const GAME_TICK_MS = 16;

/** Report the device events of `el` (and the keyboard) on the bus. Returns a function that stops reporting. */
export function attachInput(el: HTMLElement, bus: InputBus): () => void {
  const now = () => performance.now();
  const at = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = new Set<number>();
  let game = false; // (game mode, `in_302`: W A S D turn it on, a mouse click turns it off: time must pass for the view to move and turn, at a finer step)
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickMs = 0;
  const ticking = () => {
    const want = game ? GAME_TICK_MS : down.size ? TICK_MS : 0;
    if (want !== tickMs) { if (timer) clearInterval(timer); timer = want ? setInterval(() => bus.emit("input", { kind: "tick", t: now() }), want) : null; tickMs = want; }
  };
  const listeners: [EventTarget, string, (e: never) => void, AddEventListenerOptions?][] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, o);
    listeners.push([t, type, fn as (e: never) => void, o]);
  };

  const pointer = (kind: "down" | "move" | "up" | "cancel") => (e: PointerEvent) => {
    const [x, y] = at(e);
    // a mouse button released where the page could not see it (over the menu, a context menu, another window): the drag it began is over, not carried on by every later move (`in_144`)
    if (kind === "move" && e.pointerType === "mouse" && e.buttons === 0 && down.has(e.pointerId)) {
      down.delete(e.pointerId);
      bus.emit("input", { kind: "cancel", id: e.pointerId, device: "mouse", x, y, button: 0, mods: modsOf(e), t: now() });
    }
    if (kind === "down") {
      try { el.setPointerCapture(e.pointerId); } catch { /* a synthetic event has nothing to capture */ }
      down.add(e.pointerId);
      game = false; // (a click ends game mode)
    } else if (kind === "up" || kind === "cancel") down.delete(e.pointerId);
    ticking();
    bus.emit("input", { kind, id: e.pointerId, device: deviceOf(e.pointerType), x, y, button: e.button, mods: modsOf(e), t: now() });
  };
  on<PointerEvent>(el, "pointerdown", pointer("down"));
  on<PointerEvent>(el, "pointermove", pointer("move"));
  on<PointerEvent>(el, "pointerup", pointer("up"));
  on<PointerEvent>(el, "pointercancel", pointer("cancel"));
  on<PointerEvent>(el, "pointerleave", (e) => { if (!down.has(e.pointerId)) bus.emit("input", { kind: "leave", t: now() }); });
  on<Event>(el, "contextmenu", (e) => e.preventDefault());
  on<Event>(window, "blur", () => { game = false; ticking(); for (const id of down) bus.emit("input", { kind: "cancel", id, device: "mouse", x: 0, y: 0, button: 0, mods: { shift: false, ctrl: false, alt: false }, t: now() }); down.clear(); ticking(); });
  on<WheelEvent>(el, "wheel", (e) => {
    e.preventDefault();
    const [x, y] = at(e);
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    bus.emit("input", { kind: "wheel", x, y, dx: e.deltaX, dy: e.deltaY, unit: e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? 2 : 0, wheelDeltaY: legacy === undefined ? null : legacy, mods: modsOf(e), t: now() });
  }, { passive: false });
  // Safari reports a trackpad pinch as gesture events, not as ctrl + wheel
  for (const [type, phase] of [["gesturestart", "start"], ["gesturechange", "change"], ["gestureend", "end"]] as const) {
    on<Event>(el, type, (e) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      const [x, y] = at({ clientX: g.clientX ?? 0, clientY: g.clientY ?? 0 });
      bus.emit("input", { kind: "gesture", phase, scale: g.scale ?? 1, x, y, t: now() });
    });
  }
  const key = (down: boolean) => (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "o" || e.key === "g")) e.preventDefault(); // save and open are ours, not the browser's
    if (e.key === " " || e.key === "Tab" || e.key === "Backspace" || e.key.startsWith("Arrow")) e.preventDefault(); // Space + drag pans, Tab moves between typed fields: the page must not scroll, change focus or go back
    if (down && /^[wasd]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { game = true; ticking(); }
    if (down && e.key === "Escape" && game) { game = false; ticking(); }
    bus.emit("input", { kind: "key", key: e.key, down, mods: modsOf(e), t: now() });
  };
  on<KeyboardEvent>(window, "keydown", key(true));
  on<KeyboardEvent>(window, "keyup", key(false));

  return () => {
    for (const [t, type, fn, o] of listeners) t.removeEventListener(type, fn as EventListener, o);
    if (timer) clearInterval(timer);
  };
}
