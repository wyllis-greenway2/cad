// The page's own parts, drawn as HTML over the picture: the axis letters, the X Y Z buttons, the origin dot, the Reset camera pill. They
// report what was pressed; main decides what it means.
// Their looks are in one stylesheet built from `settings.ui`; only what changes (positions, the teal of a button, which icon) is set from script.
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

const EYE = '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>';
const CROSSED = EYE + '<path d="M2.5 13.5l11-11"/>';
const icon = (inner: string) => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;

function stylesheet(): string {
  const u = settings.ui, b = settings.buttons;
  return `.cad{position:fixed;user-select:none;-webkit-user-select:none;touch-action:manipulation;font-family:${u.font}}
    .cadletter{transform:translate(-50%,-50%);pointer-events:none;font-weight:600;font-size:11px;color:${u.text};display:none}
    .cadbtn{z-index:7;width:${b.sizePx}px;height:${b.sizePx}px;border-radius:50%;box-sizing:border-box;background:#fff;border:${u.borderPx}px solid ${rgb(u.buttonBorderRgb)};color:${u.text};font-weight:700;font-size:13px;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.10)}
    .cadbtn.on{border:${u.ringPx}px solid ${u.ringBorder}}
    .cadpill{z-index:8;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 8px 6px 14px;border-radius:18px;background:${u.pill};color:${u.pillText};font-weight:600;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .cadpill span+span{cursor:pointer;background:${rgb(u.tealRgb)};color:#fff;border-radius:12px;padding:4px 12px}
    .cadorb{z-index:5;box-sizing:border-box;display:none;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;border:1px solid ${u.orbDotBorder};background:${u.orbDot};color:${u.text};width:${u.orbPx}px;height:${u.orbPx}px;margin:-${u.orbPx / 2}px 0 0 -${u.orbPx / 2}px;transition:width .12s,height .12s,margin .12s,background .12s}
    .cadorb svg{display:none}
    .cadorb:hover{width:${u.orbHotPx}px;height:${u.orbHotPx}px;margin:-${u.orbHotPx / 2}px 0 0 -${u.orbHotPx / 2}px;background:#fff;border-color:${u.orbHotBorder};box-shadow:0 1px 3px rgba(0,0,0,.25)}
    .cadorb:hover svg{display:block}`;
}

export function createUi(host: HTMLElement, on: UiHandlers) {
  const style = document.createElement("style");
  style.textContent = stylesheet();
  document.head.appendChild(style);
  const make = (cls: string, tag = "div") => { const el = document.createElement(tag); el.className = `cad ${cls}`; host.appendChild(el); return el; };
  const stop = (el: HTMLElement) => el.addEventListener("pointerdown", (e) => e.stopPropagation());

  const letters = ([0, 1, 2] as const).map((i) => { const el = make("cadletter"); el.textContent = AXIS_NAME[i]!; return el; });
  const buttons = ([0, 1, 2] as const).map((i) => {
    const b = make("cadbtn");
    b.textContent = AXIS_NAME[i]!; b.title = `Look along ${AXIS_NAME[i]} (press again for the back)`;
    stop(b); b.addEventListener("click", (e) => { e.stopPropagation(); on.look(i); });
    return b;
  });
  // the origin dot: pointing at it shows what a click does, an eye (a click would show the axes and panes) or a crossed eye (a click would put
  // them away)
  const orb = make("cadorb");
  orb.title = "Hide the axes and the planes"; orb.innerHTML = icon(CROSSED);
  let hiddenNow = false;
  stop(orb);
  orb.addEventListener("click", (e) => { e.stopPropagation(); on.toggleWorld(); });
  orb.addEventListener("wheel", (e) => { e.preventDefault(); document.getElementById("view")?.dispatchEvent(new WheelEvent("wheel", e)); }, { passive: false }); // (a wheel over the dot zooms the view like anywhere else)
  const pill = make("cadpill");
  pill.innerHTML = `<span>Nothing in view:</span><span id="reset">Reset camera</span>`;
  stop(pill); pill.querySelector("span+span")!.addEventListener("click", (e) => { e.stopPropagation(); on.reset(); });

  return {
    update(s: UiState) {
      letters.forEach((el, i) => { const l = s.letters.find((q) => q.axis === i); el.style.display = l?.at ? "block" : "none"; if (l?.at) { el.style.left = `${l.at[0]}px`; el.style.top = `${l.at[1]}px`; } });
      if (s.origin) { orb.style.display = "flex"; orb.style.left = `${Math.round(s.origin[0])}px`; orb.style.top = `${Math.round(s.origin[1])}px`; } else orb.style.display = "none";
      if (s.worldHidden !== hiddenNow) { hiddenNow = s.worldHidden; orb.innerHTML = icon(hiddenNow ? EYE : CROSSED); orb.title = hiddenNow ? "Show the axes and the planes" : "Hide the axes and the planes"; }
      pill.style.display = s.lost ? "flex" : "none";
      const { marginPx: m, sizePx: z } = settings.buttons, pitch = z + settings.ui.buttonGapPx;
      const { whiteRgb, textRgb, tealRgb, buttonBorderRgb } = settings.ui;
      buttons.forEach((b, i) => {
        b.style.left = `${s.w - m - z}px`; b.style.top = `${s.h - m - 3 * pitch + settings.ui.buttonGapPx + i * pitch}px`;
        const k = s.facing.axis === i ? s.facing.strength : 0; // the axis the view is nearest to takes on the teal as the view comes round to it
        const mix = (from: readonly number[], to: readonly number[]) => rgb(from.map((c, j) => Math.round(c + (to[j]! - c) * k)));
        b.textContent = k > 0.5 ? `${s.facing.sign > 0 ? "+" : "−"}${AXIS_NAME[i]}` : AXIS_NAME[i]!;
        b.style.background = mix(whiteRgb, tealRgb); b.style.color = mix(textRgb, whiteRgb);
        b.classList.toggle("on", s.plane === i); // the plane that is on: a thinner, lighter border of the button itself
        b.style.lineHeight = `${z - 2 * (s.plane === i ? settings.ui.ringPx : settings.ui.borderPx)}px`;
        b.style.borderColor = s.plane === i ? settings.ui.ringBorder : mix(buttonBorderRgb, tealRgb);
      });
    },
  };
}
