// The shared pieces of the labelled panels that stand still on the left of the page (`in_685` the gear box, `in_931`, `in_932` the fastener tool): the panel itself, a titled section, a row (the name, the box, its unit, a line saying
// what it is) and the boxes in it, so every tool's settings look and sit the same. They know nothing of what a row means.
import { textButton } from "./look.ts";

const BORDER = "#cfd0d4";
/** The panel: a white card on the left of the page that does not let the pointer through to the view. */
export function panelShell(host: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:14px;top:84px;width:min(300px,calc(100vw - 28px));max-height:calc(100vh - 140px);overflow-y:auto;display:none;box-sizing:border-box;padding:12px 14px;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu", "click"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu" && !(e.target instanceof HTMLInputElement)) e.preventDefault(); });
  return el;
}
/** A message above the rows: `tone` red for what is wrong, teal for a suggestion, blue for information. */
export function noteBox(tone: "warn" | "suggest" | "info"): HTMLDivElement {
  const d = document.createElement("div");
  const [bg, fg] = tone === "warn" ? ["#fde8e8", "#b42318"] : tone === "suggest" ? ["#e6f6f5", "#0b6b67"] : ["#eef2fb", "#2b3a67"];
  d.style.cssText = `display:none;margin:2px 0 6px;padding:6px 8px;border-radius:8px;background:${bg};color:${fg};font-size:12px;line-height:1.4`;
  return d;
}
export const setNote = (d: HTMLElement, text: string | null | undefined): void => { d.textContent = text ?? ""; d.style.display = text ? "block" : "none"; };
export function panelTitle(text: string): HTMLDivElement {
  const t = document.createElement("div");
  t.textContent = text;
  t.style.cssText = "font-weight:600;font-size:15px;margin-bottom:6px";
  return t;
}
/** A heading over a group of rows. */
export function sectionTitle(text: string): HTMLDivElement {
  const t = document.createElement("div");
  t.textContent = text;
  t.style.cssText = "font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b6e75;margin:10px 0 0";
  return t;
}
/** The number box of a row. */
export function numberInput(o: { placeholder?: string; onInput(text: string): void; onEnter(): void; onEscape(): void }): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.placeholder = o.placeholder ?? "";
  input.style.cssText = `width:84px;box-sizing:border-box;padding:6px 8px;border:1px solid ${BORDER};border-radius:8px;font:600 14px system-ui,sans-serif;text-align:right;outline:none;user-select:text;-webkit-user-select:text`;
  input.addEventListener("focus", () => { input.select(); input.style.borderColor = "#1ab8b3"; });
  input.addEventListener("blur", () => { input.style.borderColor = BORDER; });
  input.addEventListener("input", () => o.onInput(input.value));
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation(); // the keys typed here are this box's
    if (ev.key === "Enter") { ev.preventDefault(); o.onEnter(); input.blur(); } else if (ev.key === "Escape") { ev.preventDefault(); input.blur(); o.onEscape(); }
  });
  return input;
}
/** The choice box of a row: a dropdown, the width of the number box's row. */
export function choiceSelect(onChange: () => void): HTMLSelectElement {
  const s = document.createElement("select");
  s.style.cssText = `width:150px;max-width:60%;box-sizing:border-box;padding:6px 6px;border:1px solid ${BORDER};border-radius:8px;font:600 13px system-ui,sans-serif;background:#fff;color:#2b2b2d;outline:none;cursor:pointer`;
  s.addEventListener("change", onChange);
  s.addEventListener("keydown", (ev) => ev.stopPropagation());
  return s;
}
/** Fill a dropdown with its choices (only when they changed) and show the value. */
export function fillSelect(s: HTMLSelectElement, items: readonly { id: string; label: string }[], value: string): void {
  const sig = items.map((i) => i.id + i.label).join("|");
  if (s.dataset.sig !== sig) { s.replaceChildren(...items.map((i) => { const o = document.createElement("option"); o.value = i.id; o.textContent = i.label; return o; })); s.dataset.sig = sig; }
  if (s.value !== value) s.value = value;
}
export interface Row { el: HTMLDivElement; hint: HTMLDivElement; unit: HTMLSpanElement; label: HTMLLabelElement }
/** A row: the name, the box (a number box or a dropdown), the unit, and under them a line saying what it is. */
export function panelRow(label: string, control: HTMLElement, unit = ""): Row {
  const row = document.createElement("div");
  row.style.cssText = "padding:6px 0;border-top:1px solid #f0f1f3";
  const line = document.createElement("div");
  line.style.cssText = "display:flex;align-items:center;gap:8px";
  const name = document.createElement("label");
  name.textContent = label;
  name.style.cssText = "flex:1;font-weight:600";
  name.addEventListener("click", () => control.focus());
  const u = document.createElement("span");
  u.textContent = unit;
  u.style.cssText = `width:${unit.length > 1 ? 22 : 10}px;opacity:.65`;
  line.append(name, control, u);
  const hint = document.createElement("div");
  hint.style.cssText = "font-size:11.5px;color:#777;margin-top:3px;line-height:1.35";
  row.append(line, hint);
  return { el: row, hint, unit: u, label: name };
}
/** The buttons at the bottom of a panel, which stay there while a long list of rows scrolls. */
export function panelButtons(left: { label: string; click(): void }, right: { label: string; click(): void }): HTMLDivElement {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:10px;position:sticky;bottom:-12px;padding:8px 0 4px;background:#fff;border-top:1px solid #f0f1f3";
  bar.append(textButton(left.label, { click: left.click }), textButton(right.label, { tone: "primary", click: right.click }));
  return bar;
}
