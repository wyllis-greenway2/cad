// Raw browser events turned into a few intents (prin_input_agnostic): orbit, pan, zoom, hover, click. Mouse, trackpad and touch all end up here.
// Mouse: left-drag on empty space or right-drag or Alt+left-drag orbits; middle-drag, Shift+right-drag, Space+drag or Alt+Shift+left-drag pans; the wheel zooms.
// Trackpad: a two-finger scroll pans, a pinch zooms. Touch: one finger orbits, two fingers pan and pinch.
import { settings } from "./settings.ts";

export interface Intents {
  orbit(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  /** `factor` below 1 zooms in; (x, y) is the pointer in pixels. */
  zoom(factor: number, x: number, y: number): void;
  hover(x: number, y: number): void;
  click(x: number, y: number, count: number): void;
  /** A drag (of the view) started or ended; main uses it to know when a press became a drag. */
  dragStart?(): void;
  dragEnd?(): void;
}

type Action = "orbit" | "pan" | "click";
export const actionOf = (button: number, m: { shift: boolean; alt: boolean }, space: boolean): Action => {
  if (button === 1) return "pan";
  if (button === 2) return m.shift ? "pan" : "orbit";
  if (space || (m.alt && m.shift)) return "pan";
  if (m.alt) return "orbit";
  return "click"; // a plain left press: a click if it does not move, else the view turns
};

/** What a wheel event is: a pinch, a wheel's notch (zoom) or a trackpad's scroll (pan). */
export function wheelKind(e: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }): "pinch" | "wheel" | "scroll" {
  if (e.ctrlKey) return "pinch";
  if (e.deltaMode !== 0) return "wheel";
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 ? "wheel" : "scroll";
}

export function attach(el: HTMLElement, out: Intents, opts: { locked: () => boolean }): () => void {
  let space = false;
  let drag: { button: number; x0: number; y0: number; x: number; y: number; moved: boolean; action: Action } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  let last = { t: 0, x: 0, y: 0, n: 0 };
  const count = (x: number, y: number, t: number) => {
    last = t - last.t < 400 && Math.hypot(x - last.x, y - last.y) < 6 ? { t, x, y, n: last.n + 1 } : { t, x, y, n: 1 };
    return last.n;
  };
  const pos = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const down = (e: PointerEvent) => {
    const p = pos(e);
    el.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, p);
      tap = touches.size === 1 ? { ...p, t: e.timeStamp, moved: false } : null;
      return;
    }
    drag = { button: e.button, x0: p.x, y0: p.y, ...p, moved: false, action: actionOf(e.button, { shift: e.shiftKey, alt: e.altKey }, space) };
  };
  const move = (e: PointerEvent) => {
    if (opts.locked()) return; // game mode: the pointer is held at the middle and turns the view elsewhere
    const p = pos(e);
    if (e.pointerType === "touch") {
      const was = touches.get(e.pointerId);
      if (!was) return;
      const before = [...touches.values()];
      touches.set(e.pointerId, p);
      const dx = p.x - was.x, dy = p.y - was.y;
      if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > settings.view.clickMovePx * 3) tap.moved = true;
      if (touches.size === 1) { if (tap?.moved) out.orbit(dx, dy); }
      else if (touches.size === 2) {
        const now = [...touches.values()];
        const d0 = Math.hypot(before[0]!.x - before[1]!.x, before[0]!.y - before[1]!.y), d1 = Math.hypot(now[0]!.x - now[1]!.x, now[0]!.y - now[1]!.y);
        out.pan(dx / 2, dy / 2); // each finger moves by its own share; together they move the centre
        if (d0 > 0 && d1 > 0) out.zoom(d0 / d1, (now[0]!.x + now[1]!.x) / 2, (now[0]!.y + now[1]!.y) / 2);
      }
      return;
    }
    if (!drag) { out.hover(p.x, p.y); return; }
    if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) < settings.view.clickMovePx) return;
    if (!drag.moved) out.dragStart?.();
    drag.moved = true;
    const dx = p.x - drag.x, dy = p.y - drag.y;
    drag.x = p.x; drag.y = p.y;
    if (drag.action === "pan") out.pan(dx, dy); else out.orbit(dx, dy);
  };
  const up = (e: PointerEvent) => {
    const p = pos(e);
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (tap && touches.size === 0 && !tap.moved && e.type === "pointerup") out.click(p.x, p.y, count(p.x, p.y, e.timeStamp));
      if (touches.size === 0) tap = null;
      return;
    }
    const d = drag; drag = null;
    if (!d) return;
    if (d.moved) { out.dragEnd?.(); return; }
    if (d.action === "click" && e.type === "pointerup") out.click(p.x, p.y, count(p.x, p.y, e.timeStamp));
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const kind = wheelKind(e);
    if (kind === "scroll") out.pan(-e.deltaX * settings.input.trackpadPanScale, -e.deltaY * settings.input.trackpadPanScale);
    else {
      const per = kind === "pinch" ? settings.input.pinchZoomPerWheel : settings.input.zoomPerWheel;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      out.zoom(Math.exp(dy * per), x, y);
    }
  };
  const keydown = (e: KeyboardEvent) => { if (e.code === "Space") { space = true; if (e.target === document.body) e.preventDefault(); } };
  const keyup = (e: KeyboardEvent) => { if (e.code === "Space") space = false; };
  const menu = (e: Event) => e.preventDefault();

  el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("contextmenu", menu);
  addEventListener("keydown", keydown); addEventListener("keyup", keyup);
  return () => {
    el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    el.removeEventListener("wheel", wheel); el.removeEventListener("contextmenu", menu); removeEventListener("keydown", keydown); removeEventListener("keyup", keyup);
  };
}
