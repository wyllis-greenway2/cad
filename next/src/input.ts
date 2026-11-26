// Raw browser events turned into a few intents (prin_input_agnostic): orbit, pan, zoom, gesture, hover, click. Mouse, trackpad and touch all end up here.
// Mouse: left-drag on empty space, right-drag or Alt+left-drag orbits; middle-drag, Shift+right-drag, Space+drag or Alt+Shift+left-drag pans; the wheel zooms.
// Touch and trackpad are the same thing, a gesture: two fingers pan (by the motion of the pair) and zoom (by the spread of the pair) at the same time. On a touch screen
// the page sees both fingers; on a trackpad the browser reports the pair's motion as a scroll and its spread as a pinch, so a gesture is made of whichever arrives.
// One finger orbits on a touch screen; on a trackpad a one-finger drag with the button down is the mouse's left-drag.
import { settings } from "./settings.ts";
import { fineGain } from "./camera.ts";

export interface Intents {
  /** A drag of the view is about to begin at (x, y); the controller picks what it turns or pans about, once, for the whole drag. */
  dragStart(x: number, y: number): void;
  orbit(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  /** A wheel's notch: `factor` below 1 zooms in; (x, y) is the pointer in pixels. */
  zoom(factor: number, x: number, y: number): void;
  /** Two fingers on a touch screen or a trackpad: the view is slid by (dx, dy) (the scene follows the fingers) and zoomed by `factor` (below 1 zooms in, the spread of the fingers changed by 1 / factor), about (x, y), at the same time. */
  gesture(dx: number, dy: number, factor: number, x: number, y: number): void;
  dragEnd(): void;
  /** Where the pointer is, kept up to date while a button is held too (a drag of the view), so what is drawn under it stays under it. */
  hover(x: number, y: number): void;
  /** The pointer left the view. */
  leave(): void;
  click(x: number, y: number, count: number): void;
  /** A right click that did not move, or a long press: the menu, at (x, y). */
  menu(x: number, y: number): void;
  /** The mouse moved while the pointer is held (game mode): by how much. */
  look(dx: number, dy: number): void;
  /** A press at (x, y) with the left button: does it take hold of something that is the page's own (a handle of the mover orb)? `shift` was held. If so the press, its moves and its release are the handle's, and not the view's. */
  grab(x: number, y: number, shift: boolean): boolean;
  grabMove(x: number, y: number): void;
  grabEnd(): void;
  /** The space bar was tapped (let go without having been used to pan): game mode on or off. */
  space(): void;
}

type Action = "orbit" | "pan" | "click";
export const actionOf = (button: number, m: { shift: boolean; alt: boolean }, space: boolean): Action => {
  if (button === 1) return "pan";
  if (button === 2) return m.shift ? "pan" : "orbit";
  if (space || (m.alt && m.shift)) return "pan";
  if (m.alt) return "orbit";
  return "click"; // a plain left press: a click if it does not move, else the view turns
};

export type WheelKind = "pinch" | "wheel" | "scroll";
/** What a wheel event is on its own: a pinch (the browser's way of reporting a trackpad's spread), a wheel's notch (zoom) or a trackpad's scroll (the motion of two fingers). */
export function wheelKind(e: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }): WheelKind {
  if (e.ctrlKey) return "pinch";
  if (e.deltaMode !== 0) return "wheel";
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= settings.input.wheelNotchMin
    ? "wheel"
    : "scroll";
}
/**
 * A gesture keeps its kind while its events keep coming (`scrollStreamMs`): the first event decides, so the tail of a trackpad's flick (small steps, and now and then a whole number) is not taken for a wheel,
 * and a wheel spun fast is not taken for a scroll. `prev` is the kind and time of the last event.
 */
export function classifyWheel(
  e: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number },
  now: number,
  prev: { kind: WheelKind; t: number } | null,
): { kind: WheelKind; t: number } {
  const own = wheelKind(e);
  if (own === "pinch") return { kind: own, t: now };
  return {
    kind: prev && prev.kind !== "pinch" && now - prev.t < settings.input.scrollStreamMs ? prev.kind : own,
    t: now,
  };
}

export function attach(el: HTMLElement, out: Intents, locked: () => boolean): () => void {
  let space = false,
    spaceUsed = false; // (the space bar held is a pan modifier; tapped alone it is the game switch)
  let drag: {
    x0: number;
    y0: number;
    x: number;
    y: number;
    moved: boolean;
    action: Action;
    button: number;
    shift: boolean;
  } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let tap: { x: number; y: number; moved: boolean } | null = null;
  let grabbing = false; // (a handle of the mover orb has the pointer)
  let touchKind: "orbit" | "pan" | null = null;
  let last = { t: 0, x: 0, y: 0, n: 0 };
  const count = (x: number, y: number, t: number) => {
    last =
      t - last.t < settings.input.multiClickMs && Math.hypot(x - last.x, y - last.y) < settings.input.multiClickPx
        ? { t, x, y, n: last.n + 1 }
        : { t, x, y, n: 1 };
    return last.n;
  };
  const pos = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const turn = (dx: number, dy: number) => {
    const g = fineGain(Math.hypot(dx, dy));
    out.orbit(dx * g, dy * g);
  };

  const down = (e: PointerEvent) => {
    const p = pos(e);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* (a pointer that is not there to capture) */
    }
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, p);
      tap = touches.size === 1 ? { ...p, moved: false } : null;
      if (touches.size === 2) {
        if (touchKind) out.dragEnd();
        touchKind = "pan";
        out.dragStart(p.x, p.y);
      }
      return;
    }
    if (e.button === 0 && !space && !e.altKey && out.grab(p.x, p.y, e.shiftKey)) {
      grabbing = true;
      return;
    }
    if (space) spaceUsed = true;
    drag = {
      x0: p.x,
      y0: p.y,
      ...p,
      moved: false,
      action: actionOf(e.button, { shift: e.shiftKey, alt: e.altKey }, space),
      button: e.button,
      shift: e.shiftKey,
    };
  };
  const move = (e: PointerEvent) => {
    if (locked()) {
      out.look(e.movementX, e.movementY);
      return;
    } // game mode: the pointer is held at the middle and turns the view
    const p = pos(e);
    if (e.pointerType === "touch") {
      const was = touches.get(e.pointerId);
      if (!was) return;
      const before = [...touches.values()];
      touches.set(e.pointerId, p);
      const dx = p.x - was.x,
        dy = p.y - was.y;
      if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > settings.input.touchSlopPx) tap.moved = true;
      if (touches.size === 1) {
        if (tap?.moved) {
          if (touchKind !== "orbit") {
            touchKind = "orbit";
            out.dragStart(tap.x, tap.y);
          }
          turn(dx, dy);
        }
      } else if (touches.size === 2) {
        const now = [...touches.values()];
        const d0 = Math.hypot(before[0]!.x - before[1]!.x, before[0]!.y - before[1]!.y),
          d1 = Math.hypot(now[0]!.x - now[1]!.x, now[0]!.y - now[1]!.y);
        out.gesture(
          dx / 2,
          dy / 2,
          d0 > 0 && d1 > 0 ? d0 / d1 : 1,
          (now[0]!.x + now[1]!.x) / 2,
          (now[0]!.y + now[1]!.y) / 2,
        ); // (each finger's share of the pair's motion, and the change of their spread, together)
      }
      return;
    }
    if (grabbing) {
      out.hover(p.x, p.y);
      out.grabMove(p.x, p.y);
      return;
    }
    out.hover(p.x, p.y); // (also while dragging: the disc under the pointer follows it as the view turns)
    if (!drag) return;
    if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) < settings.view.clickMovePx) return;
    if (!drag.moved) {
      drag.moved = true;
      out.dragStart(drag.x0, drag.y0);
    }
    const dx = p.x - drag.x,
      dy = p.y - drag.y;
    drag.x = p.x;
    drag.y = p.y;
    if (drag.action === "pan") out.pan(dx, dy);
    else turn(dx, dy);
  };
  const up = (e: PointerEvent) => {
    const p = pos(e);
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (tap && touches.size === 0 && !tap.moved && e.type === "pointerup")
        out.click(p.x, p.y, count(p.x, p.y, e.timeStamp));
      if (touches.size === 0) {
        if (touchKind) out.dragEnd();
        touchKind = null;
        tap = null;
      }
      return;
    }
    if (grabbing) {
      grabbing = false;
      out.grabEnd();
      return;
    }
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.moved) {
      out.dragEnd();
      return;
    }
    if (d.action === "click" && e.type === "pointerup") out.click(p.x, p.y, count(p.x, p.y, e.timeStamp));
    else if (d.button === 2 && !d.shift && e.type === "pointerup") out.menu(p.x, p.y); // (a right click that did not move: the menu; a right drag orbits)
  };
  let stream: { kind: WheelKind; t: number } | null = null,
    scrolling: ReturnType<typeof setTimeout> | null = null;
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = el.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    stream = classifyWheel(e, e.timeStamp, stream);
    if (stream.kind === "pinch") {
      out.gesture(0, 0, Math.exp(e.deltaY * settings.input.pinchZoomPerWheel), x, y);
      return;
    } // (the spread of two fingers on a trackpad)
    if (stream.kind === "wheel") {
      out.zoom(
        Math.exp((e.deltaMode === 1 ? e.deltaY * settings.input.wheelLinePx : e.deltaY) * settings.input.zoomPerWheel),
        x,
        y,
      );
      return;
    }
    // the motion of two fingers on a trackpad: the scene follows them. With natural scrolling the scroll is the way the fingers go, without it the other way; the system says which where it can.
    const inverted = (e as WheelEvent & { webkitDirectionInvertedFromDevice?: boolean })
      .webkitDirectionInvertedFromDevice;
    const dir = (inverted ?? settings.input.trackpadNatural) ? -1 : 1;
    if (locked()) {
      out.look(dir * e.deltaX * settings.input.trackpadLookScale, dir * e.deltaY * settings.input.trackpadLookScale);
      return;
    } // game mode: two fingers on a trackpad turn the view as a mouse does
    const k = dir * settings.input.trackpadPanScale;
    if (scrolling === null)
      out.dragStart(x, y); // (what is grabbed is chosen once for the whole scroll, as for a drag)
    else clearTimeout(scrolling);
    out.gesture(e.deltaX * k, e.deltaY * k, 1, x, y);
    scrolling = setTimeout(() => {
      scrolling = null;
      out.dragEnd();
    }, settings.input.scrollStreamMs);
  };
  const keydown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      if (!e.repeat) {
        space = true;
        spaceUsed = false;
      }
      if (e.target === document.body || e.target === el) e.preventDefault();
    }
  };
  const keyup = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      const tapped = space && !spaceUsed;
      space = false;
      if (tapped) out.space();
    }
  };
  const menu = (e: Event) => e.preventDefault();
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== "touch" && !drag) out.leave();
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", leave);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", menu);
  addEventListener("keydown", keydown);
  addEventListener("keyup", keyup);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("pointerleave", leave);
    el.removeEventListener("wheel", wheel);
    el.removeEventListener("contextmenu", menu);
    removeEventListener("keydown", keydown);
    removeEventListener("keyup", keyup);
  };
}
