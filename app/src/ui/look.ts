// One look for the small controls that sit over the view (`in_300`): a dark pill, and choices in it that are teal when on and pale when off. The Similar chip, the join / separate chip of Combine and the group chip are all made of these.
import { iconSvg } from "./icons.ts";
/** The dark pill that holds a label and its choices. */
export const PILL = "position:fixed;z-index:7;display:none;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:18px;background:rgba(32,34,38,.92);color:#fff;font:13px system-ui,sans-serif;white-space:nowrap;user-select:none;-webkit-user-select:none;touch-action:manipulation";
/** One choice in a pill: teal when on, pale when off. */
const choiceCss = (on: boolean, live = true, focus = false): string => `${focus ? "outline:2px solid #fff;outline-offset:1px;" : ""}display:inline-flex;align-items:center;gap:3px;cursor:${live ? "pointer" : "default"};padding:3px 8px;border-radius:12px;opacity:${live ? 1 : 0.45};background:${on ? "#1ab8b3" : "rgba(255,255,255,.16)"};color:${on ? "#06312f" : "#fff"}`;
/** A pill that is a row of choices: `onPick` is told which was clicked. Taps and presses on it do not reach the view. */
export function choiceRow(parent: HTMLElement, choices: { id: string; text: string; title: string; on: boolean; live?: boolean; /** the one the keyboard is on (Tab, `in_664`) */ focus?: boolean }[], onPick: (id: string) => void): void {
  parent.replaceChildren(...choices.map((c) => {
    const b = document.createElement("span");
    b.style.cssText = choiceCss(c.on, c.live !== false, !!c.focus);
    b.title = c.title;
    b.textContent = c.text;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); if (c.live !== false) onPick(c.id); });
    return b;
  }));
}

// ---- THE ROUND BUTTON AND THE NUMBER PILL (`in_667`, `dec_ui_unification`): the two shapes everything else is made of ----

/** How a round button reads: `light` on the view (white), `dark` on a dark pill, `danger` for a way out (red), `accent` for a mark that is not pressed (teal edge). */
export type Tone = "light" | "dark" | "danger" | "accent";
const TONE: Record<Tone, { bg: string; border: string; color: string }> = {
  light: { bg: "#fff", border: "#d6d7db", color: "#2b2b2d" },
  dark: { bg: "rgba(255,255,255,.14)", border: "transparent", color: "inherit" },
  danger: { bg: "#fff", border: "#c0392b", color: "#c0392b" },
  accent: { bg: "#fff", border: "#1ab8b3", color: "#2b2b2d" },
};
/** A round button with an icon: the one look of every round control (the ring's bubbles, the suggestions, the sheet's controls, the mode switch, the bar's check and cross). It draws; `onPress` makes it press. A button that is not `live` is faded and does nothing. */
export function roundButton(o: { icon?: string; size?: number; tone?: Tone; title?: string; live?: boolean; /** a darker edge, for a control that stands on the model */ edge?: string }): HTMLDivElement {
  const { size = 30, tone = "light", live = true } = o;
  const t = TONE[tone];
  const b = document.createElement("div");
  if (o.icon) b.innerHTML = iconSvg(o.icon);
  if (o.title) b.title = o.title;
  const edge = o.edge ?? t.border;
  b.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex:none;width:${size}px;height:${size}px;border-radius:50%;background:${t.bg};border:1px solid ${edge};color:${t.color};cursor:${live ? "pointer" : "default"};opacity:${live ? 1 : 0.38};user-select:none;-webkit-user-select:none;touch-action:manipulation${tone === "dark" ? "" : ";box-shadow:0 1px 6px rgba(0,0,0,.14)"}`;
  if (live && tone === "light") { // (pointing at one lights its edge, the same everywhere)
    b.addEventListener("pointerenter", () => { b.style.borderColor = "#1ab8b3"; b.style.background = "#e8f7f6"; });
    b.addEventListener("pointerleave", () => { b.style.borderColor = edge; b.style.background = t.bg; });
  }
  return b;
}
/** Make a control press: a press on it is not the view's (no tap or drag of the page), and a click runs `fn`. */
export function onPress(el: HTMLElement, fn: () => void): void {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
}
/** The white pill that carries a number (a constraint's bubble, a typed number, a mate): its height, its edge `border`, its shadow and its type; `extra` is the rest (where it stands, what it does). */
export const bubbleCss = (border = "#d6d7db", extra = ""): string => `display:flex;align-items:center;gap:3px;height:26px;box-sizing:border-box;padding:0 7px;border-radius:13px;background:#fff;border:1px solid ${border};box-shadow:0 1px 6px rgba(0,0,0,.12);font:13px system-ui,sans-serif;color:#2b2b2d;white-space:nowrap;${extra}`;
/** A button with words, for pages and dialogs (not over the view): plain, `primary` (filled teal: what goes on) or `on` (a choice that is chosen). */
export function textButton(label: string, o: { tone?: "plain" | "primary"; on?: boolean; click?: () => void } = {}): HTMLButtonElement {
  const fill = o.tone === "primary" || o.on;
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `padding:9px 16px;border-radius:8px;border:1px solid ${fill ? "#1d7f84" : "#cfd0d4"};background:${fill ? (o.tone === "primary" ? "#1d7f84" : "#1ab8b3") : "#fff"};color:${fill ? "#fff" : "#222"};font:inherit;cursor:pointer;min-height:40px`;
  if (o.click) b.addEventListener("click", o.click);
  return b;
}
/** A page or dialog opened by a press on a menu row: on a touch screen the click that ends that press arrives after it, on whatever now stands under the finger (a setting would be changed). The click is let through only a moment after it opened. Call the returned function when it opens. */
export function guardOpenClicks(el: HTMLElement, ms = 450): () => void {
  let until = 0;
  el.addEventListener("click", (e) => { if (performance.now() < until) { e.stopPropagation(); e.preventDefault(); } }, true);
  return () => { until = performance.now() + ms; };
}
