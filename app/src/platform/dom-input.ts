// The web implementation of the platform's input (`dec_platform_web_portable`): DOM pointer, wheel, gesture and key events become plain RawInput records on the bus.
// It knows nothing about parts, selection or the camera. A desktop or mobile wrapper provides its own version of this file.
import type { Bus } from "../shared/events.ts";
import type { RawInput, Mods, Device } from "../shared/input.ts";

export type InputBus = Bus<{ input: RawInput }>;

const modsOf = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): Mods => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
const deviceOf = (t: string): Device => (t === "touch" ? "touch" : t === "pen" ? "pen" : "mouse");
const TICK_MS = 50;

/** Report the device events of `el` (and the keyboard) on the bus. Returns a function that stops reporting. */
export function attachInput(el: HTMLElement, bus: InputBus): () => void {
  const now = () => performance.now();
  const at = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = new Set<number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  const ticking = () => {
    if (down.size && !timer) timer = setInterval(() => bus.emit("input", { kind: "tick", t: now() }), TICK_MS);
    if (!down.size && timer) (clearInterval(timer), (timer = null));
  };
  const listeners: [EventTarget, string, (e: never) => void, AddEventListenerOptions?][] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, o);
    listeners.push([t, type, fn as (e: never) => void, o]);
  };

  const pointer = (kind: "down" | "move" | "up" | "cancel") => (e: PointerEvent) => {
    const [x, y] = at(e);
    if (kind === "down") {
      try { el.setPointerCapture(e.pointerId); } catch { /* a synthetic event has nothing to capture */ }
      down.add(e.pointerId);
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
    if (e.key === " " || e.key === "Tab" || e.key === "Backspace" || e.key.startsWith("Arrow")) e.preventDefault(); // Space + drag pans, Tab moves between typed fields: the page must not scroll, change focus or go back
    bus.emit("input", { kind: "key", key: e.key, down, mods: modsOf(e), t: now() });
  };
  on<KeyboardEvent>(window, "keydown", key(true));
  on<KeyboardEvent>(window, "keyup", key(false));

  return () => {
    for (const [t, type, fn, o] of listeners) t.removeEventListener(type, fn as EventListener, o);
    if (timer) clearInterval(timer);
  };
}
