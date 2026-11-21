// The page's own parts, drawn as HTML over the picture: the axis letters, the X Y Z buttons, the origin dot, the Reset camera pill. They report what was pressed; main decides what it means.
import { settings } from "./settings.ts";
import { AXIS_NAME, type Axis } from "./camera.ts";

export interface UiHandlers { look(axis: Axis): void; reset(): void; toggleWorld(): void }
export interface UiState {
  letters: Array<{ axis: Axis; at: [number, number] | null }>; // where each axis letter stands, null if it is not to be seen
  origin: [number, number] | null; // the origin dot, null when it is not to be seen
  worldHidden: boolean;
  plane: Axis; // the plane that is on: its button has the ring
  facing: { axis: Axis; sign: 1 | -1; strength: number }; // the axis the view is nearest to: its button takes on the teal
  lost: boolean; // nothing in view: the Reset camera pill
  w: number; h: number;
}

const FONT = "system-ui,sans-serif";
export function createUi(host: HTMLElement, on: UiHandlers) {
  const css = "position:fixed;user-select:none;-webkit-user-select:none;touch-action:manipulation;";
  const stop = (el: HTMLElement) => el.addEventListener("pointerdown", (e) => e.stopPropagation());
  const letters = ([0, 1, 2] as const).map((i) => {
    const el = document.createElement("div");
    el.textContent = AXIS_NAME[i];
    el.style.cssText = css + `transform:translate(-50%,-50%);pointer-events:none;font:600 11px ${FONT};color:#2b2b2d;display:none`;
    host.appendChild(el);
    return el;
  });
  const buttons = ([0, 1, 2] as const).map((i) => {
    const b = document.createElement("div");
    b.style.cssText = css + `z-index:7;display:block;width:${settings.buttons.sizePx}px;height:${settings.buttons.sizePx}px;border-radius:50%;box-sizing:border-box;background:#fff;border:1px solid #cfd0d4;color:#2b2b2d;font:700 13px/32px ${FONT};text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.10)`;
    b.textContent = AXIS_NAME[i]; b.title = `Look along ${AXIS_NAME[i]} (press again for the back)`;
    stop(b); b.addEventListener("click", (e) => { e.stopPropagation(); on.look(i); });
    host.appendChild(b);
    return b;
  });
  // the origin dot: pointing at it shows what a click does, an eye (a click would show the axes and panes) or a crossed eye (a click would put them away)
  const EYE = '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>';
  const icon = (inner: string) => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const orb = document.createElement("div");
  const DOT = "width:12px;height:12px;margin:-6px 0 0 -6px;background:rgba(60,62,68,.55);border-color:rgba(255,255,255,.7);box-shadow:none";
  const HOT = "width:26px;height:26px;margin:-13px 0 0 -13px;background:#fff;border-color:#8a8f98;box-shadow:0 1px 3px rgba(0,0,0,.25)";
  orb.style.cssText = css + "z-index:5;border-radius:50%;box-sizing:border-box;border:1px solid;display:none;align-items:center;justify-content:center;cursor:pointer;color:#2b2b2d;transition:width .12s,height .12s,margin .12s,background .12s;" + DOT;
  let hovering = false, hiddenNow = false;
  const drawOrb = () => {
    orb.style.cssText = orb.style.cssText.replace(/(width|height|margin|background|border-color|box-shadow):[^;]*;?/g, "") + ";" + (hovering ? HOT : DOT);
    orb.innerHTML = hovering ? icon(hiddenNow ? EYE : EYE + '<path d="M2.5 13.5l11-11"/>') : "";
    orb.title = hiddenNow ? "Show the axes and the planes" : "Hide the axes and the planes";
  };
  stop(orb);
  orb.addEventListener("pointerenter", () => { hovering = true; drawOrb(); });
  orb.addEventListener("pointerleave", () => { hovering = false; drawOrb(); });
  orb.addEventListener("click", (e) => { e.stopPropagation(); on.toggleWorld(); });
  orb.addEventListener("wheel", (e) => { e.preventDefault(); document.getElementById("view")?.dispatchEvent(new WheelEvent("wheel", e)); }, { passive: false }); // (a wheel over the dot zooms the view like anywhere else)
  host.appendChild(orb);
  const pill = document.createElement("div");
  pill.style.cssText = css + `z-index:8;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 8px 6px 14px;border-radius:18px;background:#34363b;color:#fff;font:600 13px ${FONT};box-shadow:0 2px 8px rgba(0,0,0,.25)`;
  pill.innerHTML = `<span>Nothing in view:</span><span id="reset" style="cursor:pointer;background:#1ab8b3;color:#fff;border-radius:12px;padding:4px 12px">Reset camera</span>`;
  stop(pill); pill.querySelector("#reset")!.addEventListener("click", (e) => { e.stopPropagation(); on.reset(); });
  host.appendChild(pill);

  return {
    update(s: UiState) {
      letters.forEach((el, i) => { const l = s.letters.find((q) => q.axis === i); el.style.display = l?.at ? "block" : "none"; if (l?.at) { el.style.left = `${l.at[0]}px`; el.style.top = `${l.at[1]}px`; } });
      if (s.origin) { orb.style.display = "flex"; orb.style.left = `${Math.round(s.origin[0])}px`; orb.style.top = `${Math.round(s.origin[1])}px`; } else orb.style.display = "none";
      if (s.worldHidden !== hiddenNow) { hiddenNow = s.worldHidden; drawOrb(); }
      pill.style.display = s.lost ? "flex" : "none";
      const { marginPx: m, sizePx: z } = settings.buttons;
      buttons.forEach((b, i) => {
        b.style.left = `${s.w - m - z}px`; b.style.top = `${s.h - m - 3 * 38 + 4 + i * 38}px`;
        const k = s.facing.axis === i ? s.facing.strength : 0; // the axis the view is nearest to takes on the teal as the view comes round to it
        const mix = (from: number[], to: number[]) => `rgb(${from.map((c, j) => Math.round(c + (to[j]! - c) * k)).join(",")})`;
        const ring = s.plane === i; // the plane that is on: a bolder border of the button itself
        b.textContent = k > 0.5 ? `${s.facing.sign > 0 ? "+" : "−"}${AXIS_NAME[i]}` : AXIS_NAME[i]!;
        b.style.background = mix([255, 255, 255], [26, 184, 179]); b.style.color = mix([43, 43, 45], [255, 255, 255]);
        b.style.borderWidth = ring ? "3px" : "1px"; b.style.lineHeight = ring ? "28px" : "32px";
        b.style.borderColor = ring ? "#2b2b2d" : mix([207, 208, 212], [26, 184, 179]);
      });
    },
  };
}
