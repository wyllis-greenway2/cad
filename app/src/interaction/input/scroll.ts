// The wheel and the trackpad (`in_079`): a wheel notch zooms, a trackpad's two-finger scroll pans like a phone screen, a pinch zooms; Safari's pinch comes as gestures.
import type { Intent, RawInput } from "../../shared/input.ts";
import { settings } from "../../shared/settings.ts";

type Wheel = Extract<RawInput, { kind: "wheel" }>;
type Gesture = Extract<RawInput, { kind: "gesture" }>;
type Mode = typeof settings.input.scrollMode;

export function createScroll(I: typeof settings.input) {
  let mode: Mode = I.scrollMode;
  let lastScroll = { t: -1e9, pans: false };
  let lastWheel = -1e9;
  let gestureScale = 1;

  /** Does this scroll pan (a trackpad's two-finger scroll, Shift + scroll) or zoom (a wheel notch, a pinch)? */
  function pans(e: Wheel): boolean {
    if (e.mods.ctrl) return false; // a pinch
    if (e.mods.shift) return true;
    if (mode === "pan") return true;
    if (mode === "zoom") return false;
    // auto: a wheel notch is a big whole number (a multiple of 120 in wheelDeltaY) or counted in lines; a trackpad sends small, fine steps, often with a sideways part.
    // A gesture keeps its kind while its events (and their inertia) keep arriving.
    if (e.t - lastScroll.t < I.scrollNotchMs) return (lastScroll = { t: e.t, pans: lastScroll.pans }).pans;
    const notch = e.unit === 1 || (e.dx === 0 && Number.isInteger(e.dy) && Math.abs(e.dy) >= 50 && (e.wheelDeltaY === null || e.wheelDeltaY % 120 === 0));
    lastScroll = { t: e.t, pans: !notch };
    return !notch;
  }

  return {
    wheel(e: Wheel): Intent[] {
      const unit = e.unit === 1 ? 33 : 1;
      if (pans(e)) {
        // the view follows the fingers, like a phone screen
        const px = (e.mods.shift ? e.dx || e.dy : e.dx) * unit;
        const py = (e.mods.shift ? 0 : e.dy) * unit;
        return [{ type: "pan", dx: -px, dy: -py }];
      }
      // zoom, with a speed limit: a single gesture can never fling the view to the limits
      const dt = Math.min(0.12, Math.max(0.008, (e.t - lastWheel) / 1000));
      lastWheel = e.t;
      const wanted = e.dy * unit * (e.mods.ctrl ? I.pinchZoomPerWheel : settings.view.zoomPerWheel);
      const limit = Math.log(I.maxZoomFactorPerSecond) * dt;
      return [{ type: "zoom", factor: Math.exp(Math.min(limit, Math.max(-limit, wanted))), x: e.x, y: e.y }];
    },
    gesture(e: Gesture): Intent[] {
      if (e.phase === "start") { gestureScale = 1; return []; }
      if (e.phase === "end") return [];
      const k = gestureScale / (e.scale || 1);
      gestureScale = e.scale || 1;
      return [{ type: "zoom", factor: k, x: e.x, y: e.y }];
    },
    setMode: (m: Mode) => { mode = m; },
    get mode() { return mode; },
  };
}
