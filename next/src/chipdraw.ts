// The chips (`dec_three_surfaces`, `dec_marks_on_things`): how one constraint, one number and one offered constraint look and what a click on each says, shared by the info bar and the marks on the sketch. A chip is a round button with an icon (a constraint, or an
// offer) or a pill with a number and its padlock. The border says the state (grey at rest, green locked or holds, yellow offered, red refused). It draws nothing of its own accord: whoever places it keeps it, and it says what was pressed through `on`.
import { iconSvg } from "./icons.ts";
import type { Bubble } from "./interaction/bubbles.ts";

export interface InfoHandlers {
  suggest(id: string): void;
  /** a fact that is a constraint was clicked */ fact(id: string): void;
  /** a number was typed over (the solver's value: a diameter typed is already a radius) */ set(
    id: string,
    value: number,
  ): void;
  /** a padlock was clicked */ lock(id: string): void;
}

export type Border = string;
/** an applied constraint is neutral charcoal; only an offer is yellow, and what is selected is blue (`in_1661`); red is a refusal (`inv_constraint_uniformity`) */
const APPLIED = "#6b7178";
export const TONE = { rest: "#d6d7db", refused: "#e46a6a", applied: APPLIED, offer: "#f2c14e" } as const;
/** the colour of a mark's state: locked green, offered yellow, refused red */
export const STATE = { locked: APPLIED, offer: "#f2c14e", refused: "#e46a6a" } as const;

/** the one lock (`dec_marks_on_things`): small, on the corner of a chip: closed when applied, open when offered or only measured; clickable when it can be toggled */
/** A press or click on this element is its own: it does not go on to the drawing under it, and the page's menu does not open. */
export function keepEvents(el: HTMLElement): void {
  for (const t of ["pointerdown", "click", "contextmenu"])
    el.addEventListener(t, (e) => {
      e.stopPropagation();
      if (t === "contextmenu") e.preventDefault();
    });
}
function cornerLock(open: boolean, colour: string, onClick?: () => void): HTMLElement {
  const l = document.createElement("span");
  l.innerHTML = iconSvg(open ? "unlock" : "lock");
  l.dataset.lock = open ? "open" : "closed";
  l.style.cssText = `position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:${colour};transform:scale(.9);${onClick ? "cursor:pointer;pointer-events:auto" : "pointer-events:none"}`;
  if (onClick)
    l.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
  return l;
}

export function createChips(handlers: () => InfoHandlers | null, retake: () => void) {
  let editing = false;
  const numbers = new Map<string, { fact: Bubble; span: HTMLElement }>();
  /** what a number typed over a fact is, as the solver's value (a diameter typed is half of it; an angle typed inside the corner is the directed angle the solver reads, kept within a half turn either way) */
  const valueOf = (f: Bubble, typed: number): number => {
    if (!f.input) return typed;
    const v = f.input.mul * typed + f.input.add;
    if (f.unit !== "deg") return v;
    let r = ((v % 360) + 360) % 360;
    if (r > 180) r -= 360;
    return r;
  };
  function edit(f: Bubble, span: HTMLElement, initial?: string): void {
    const input = document.createElement("input"),
      start = initial ?? f.text ?? "";
    input.value = start;
    input.style.cssText = `width:${Math.max(4, start.length + 3)}ch;font:inherit;font-weight:600;border:0;outline:0;background:transparent;padding:0`;
    span.replaceWith(input);
    input.focus();
    if (initial === undefined) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
    editing = true;
    const done = (commit: boolean) => {
      if (!editing) return;
      editing = false;
      const v = Number(input.value.trim());
      if (commit && input.value.trim() !== "" && isFinite(v)) handlers()?.set(f.id, valueOf(f, v));
      retake();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(true);
      else if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(false));
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  /** the one round button (`in_1676`): a constraint (a click takes it away), an offered one (a click applies it) or a body's option; `attr`: the data attribute that names it; `lock`: the corner lock, closed or open (none: no lock); `hover`: it lights when pointed at */
  const round = (o: {
    id: string;
    icon: string;
    title: string;
    border: Border;
    attr: "fact" | "bar";
    lock?: "open" | "closed";
    hover?: boolean;
    onClick: () => void;
  }): HTMLElement => {
    const d = document.createElement("div"),
      svg = iconSvg(o.icon);
    d.dataset[o.attr] = o.id;
    d.title = o.title;
    d.innerHTML = svg || `<span style="font-weight:600">${o.title.slice(0, 2)}</span>`;
    d.style.cssText = `position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#fff;border:1.5px solid ${o.border};cursor:pointer`;
    if (o.lock) d.append(cornerLock(o.lock === "open", o.border));
    if (o.hover) {
      d.addEventListener("pointerenter", () => {
        d.style.background = "#fff8e1";
      });
      d.addEventListener("pointerleave", () => {
        d.style.background = "#fff";
      });
    }
    d.addEventListener("click", o.onClick);
    return d;
  };
  /** a number: a pill with its value and its padlock */
  const number = (f: Bubble, border: Border = TONE[f.tone]): HTMLElement => {
    const d = document.createElement("div");
    d.dataset.fact = f.id;
    d.title = f.title;
    d.style.cssText = `position:relative;box-sizing:border-box;display:flex;align-items:center;gap:4px;height:28px;padding:0 9px;border-radius:14px;background:#fff;border:1.5px solid ${border}`;
    if (f.symbol && f.symbol !== "°") {
      const s = document.createElement("span");
      s.textContent = f.symbol;
      s.style.cssText = "font-weight:600;opacity:.6";
      d.append(s);
    }
    const num = document.createElement("span");
    num.textContent = f.text ?? "";
    num.dataset.number = f.id;
    num.style.cssText = `font-weight:600;${f.readonly ? "" : "cursor:text;"}${f.locked === false ? "opacity:.8;" : ""}`;
    if (!f.readonly) num.addEventListener("click", () => edit(f, num));
    numbers.set(f.id, { fact: f, span: num });
    d.append(num);
    if (f.symbol === "°") {
      const s = document.createElement("span");
      s.textContent = "°";
      s.style.cssText = "font-weight:600;opacity:.6;margin-left:-3px";
      d.append(s);
    }
    if (f.locked !== undefined) {
      // the lock, as on every mark: on the corner; closed when the number is a constraint (or typed), open when it is only measured; a click on it locks or lets go
      const l = cornerLock(!f.locked, border, f.readonly ? undefined : () => handlers()?.lock(f.id));
      l.dataset.padlock = f.locked ? "closed" : "open";
      l.title = f.readonly
        ? f.locked
          ? "typed"
          : "measured"
        : f.locked
          ? "Locked: click to let it go"
          : "Measured: click to lock it at this number";
      d.append(l);
    }
    return d;
  };
  return {
    round,
    number,
    forget: () => numbers.clear(),
    /** digits typed with the subject selected go to its number: the text starts as the key typed; false: there is no such number */
    startEdit(id: string, initial: string): boolean {
      const n = numbers.get(id);
      if (!n || editing || n.fact.readonly || !n.span.isConnected) return false;
      edit(n.fact, n.span, initial);
      return true;
    },
    editing: (): boolean => editing,
  };
}
