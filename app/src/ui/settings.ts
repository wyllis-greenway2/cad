// The settings page (`dec_settings_page`, `in_554`): a page over the whole window, opened from the ⋯ list. Numbers (inch or mm), the view, the mouse and trackpad, and the keyboard with every key binding
// shown and the person able to set their own. It shows what `read()` says and reports each change through `change`; it keeps nothing of its own.
import { KEY_ACTIONS, KEY_GROUPS, chordOf, specText, rebind, unbind } from "../interaction/preferences.ts";
import type { Keys } from "../interaction/preferences.ts";
import type { NumberSystem } from "../shared/units.ts";
import { textButton, guardOpenClicks } from "./look.ts";

export interface Prefs { units: NumberSystem; outlines: boolean; scrollMode: "auto" | "pan" | "zoom"; panScale: number; keys: Keys; usualKeys: Keys }
export type Change =
  | { what: "units"; value: NumberSystem } | { what: "outlines"; value: boolean } | { what: "scrollMode"; value: Prefs["scrollMode"] } | { what: "panScale"; value: number } | { what: "keys"; value: Keys };

const PAN = [{ v: 0.15, t: "Low" }, { v: 0.3, t: "Medium" }, { v: 0.5, t: "High" }];

export function createSettings(host: HTMLElement, read: () => Prefs, change: (c: Change) => void) {
  const page = document.createElement("div");
  page.style.cssText = "position:fixed;inset:0;display:none;background:#f4f5f7;z-index:1100;overflow-y:auto;font:14px system-ui,sans-serif;color:#2b2b2d";
  host.appendChild(page);
  const armed = guardOpenClicks(page); // (the press that opened the page must not click on it, `in_567`)
  let capturing: { action: string; index: number } | null = null;
  let note = "";
  const el = (tag: string, css = "", text = ""): HTMLElement => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; };
  const section = (title: string, ...rows: HTMLElement[]): HTMLElement => {
    const s = el("div", "background:#fff;border:1px solid #e1e2e6;border-radius:12px;padding:6px 18px 12px;margin:0 0 16px");
    s.append(el("h2", "font-size:15px;margin:14px 0 6px", title), ...rows);
    return s;
  };
  const choice = (label: string, options: { v: string; t: string }[], current: string, pick: (v: string) => void, hint = ""): HTMLElement => {
    const r = el("div", "display:flex;align-items:center;gap:14px;padding:9px 0;border-top:1px solid #f0f1f3;flex-wrap:wrap");
    const l = el("div", "flex:1;min-width:180px");
    l.append(el("div", "", label)); if (hint) l.append(el("div", "font-size:12px;color:#777;margin-top:2px", hint));
    const g = el("div", "display:flex;gap:6px");
    for (const o of options) {
      g.append(textButton(o.t, { on: o.v === current, click: () => pick(o.v) }));
    }
    r.append(l, g);
    return r;
  };
  const chip = (text: string, css: string, click: () => void): HTMLElement => { const b = el("button", `padding:6px 10px;border-radius:7px;font:inherit;cursor:pointer;min-height:32px;${css}`, text); b.addEventListener("click", click); return b; };

  const keyRow = (a: { id: string; label: string }, keys: Keys): HTMLElement => {
    const r = el("div", "display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #f0f1f3;flex-wrap:wrap");
    r.append(el("div", "flex:1;min-width:150px", a.label));
    const list = keys[a.id] ?? [];
    for (const [i, spec] of list.entries()) {
      const on = capturing?.action === a.id && capturing.index === i;
      const g = el("div", "display:flex");
      g.append(
        chip(on ? "Press a key…" : specText(spec), `border:1px solid ${on ? "#1ab8b3" : "#cfd0d4"};background:${on ? "#e8f8f7" : "#fff"};border-radius:7px 0 0 7px;min-width:70px`, () => { capturing = on ? null : { action: a.id, index: i }; note = ""; draw(); }),
        chip("×", "border:1px solid #cfd0d4;border-left:0;background:#fff;border-radius:0 7px 7px 0;color:#c0392b", () => { change({ what: "keys", value: unbind(keys, a.id, i) }); capturing = null; note = ""; draw(); }),
      );
      g.children[1]!.setAttribute("title", "Take this key away");
      r.append(g);
    }
    const adding = capturing?.action === a.id && capturing.index >= list.length;
    r.append(chip(adding ? "Press a key…" : list.length ? "+" : "Set a key", `border:1px dashed ${adding ? "#1ab8b3" : "#b9bac0"};background:${adding ? "#e8f8f7" : "#fff"}`, () => { capturing = adding ? null : { action: a.id, index: list.length }; note = ""; draw(); }));
    return r;
  };

  const draw = (): void => {
    const p = read();
    const head = el("div", "position:sticky;top:0;background:#f4f5f7;padding:14px 0 10px;display:flex;align-items:center;gap:12px;z-index:1");
    head.append(el("div", "font-size:20px;font-weight:600;flex:1", "Settings"), textButton("Done", { tone: "primary", click: close }));
    const body = el("div", "max-width:720px;margin:0 auto;padding:0 16px 40px");
    body.append(head);
    body.append(section("Numbers", choice("Number system", [{ v: "mm", t: "Millimetres" }, { v: "in", t: "Inches" }], p.units, (v) => { change({ what: "units", value: v as NumberSystem }); draw(); }, "What lengths are shown and typed in. The model itself is kept exactly, whichever you use.")));
    body.append(section("View", choice("Edge lines", [{ v: "on", t: "Show" }, { v: "off", t: "Hide" }], p.outlines ? "on" : "off", (v) => { change({ what: "outlines", value: v === "on" }); draw(); }, "The dark lines along a body's edges. Hidden, a body is drawn by its shading alone.")));
    body.append(section("Mouse and trackpad",
      choice("A scroll", [{ v: "auto", t: "Automatic" }, { v: "pan", t: "Pans" }, { v: "zoom", t: "Zooms" }], p.scrollMode, (v) => { change({ what: "scrollMode", value: v as Prefs["scrollMode"] }); draw(); }, "Automatic: a trackpad's two-finger scroll pans and a wheel zooms. A pinch always zooms."),
      choice("Trackpad pan speed", PAN.map((x) => ({ v: String(x.v), t: x.t })), String(PAN.reduce((a, x) => (Math.abs(x.v - p.panScale) < Math.abs(a.v - p.panScale) ? x : a)).v), (v) => { change({ what: "panScale", value: Number(v) }); draw(); }, "How much of a two-finger scroll the view moves by."),
    ));
    const keys = el("div", "");
    const k = section("Keyboard", el("div", "font-size:12px;color:#777;margin:0 0 6px", "Click a key to change it, × to take it away, or add one. Ctrl also means Cmd. A key that another action has moves to the one you set it on."));
    if (note) k.append(el("div", "padding:8px 10px;margin:6px 0;border-radius:8px;background:#fff4e5;color:#7a4b00", note));
    for (const g of KEY_GROUPS) { k.append(el("div", "font-size:12px;font-weight:600;color:#555;margin:12px 0 2px", g)); for (const a of KEY_ACTIONS.filter((x) => x.group === g)) k.append(keyRow(a, p.keys)); }
    k.append(el("div", "height:10px"), textButton("Put every key back", { click: () => { change({ what: "keys", value: Object.fromEntries(Object.entries(p.usualKeys).map(([a, l]) => [a, [...l]])) }); capturing = null; note = ""; draw(); } }));
    keys.append(k);
    body.append(keys);
    const top = page.scrollTop;
    page.replaceChildren(body);
    page.scrollTop = top;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (page.style.display === "none") return;
    e.stopPropagation();
    if (e.type === "keyup") return;
    if (capturing) {
      e.preventDefault();
      if (e.key === "Escape") { capturing = null; note = ""; draw(); return; }
      const c = chordOf(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
      if (!c.ok) { note = c.why; draw(); return; }
      const keys = read().keys;
      const { keys: next, tookFrom } = rebind(keys, capturing.action, capturing.index, c.spec);
      change({ what: "keys", value: next });
      note = tookFrom ? `${specText(c.spec)} was ${KEY_ACTIONS.find((a) => a.id === tookFrom)?.label ?? tookFrom}'s: it is now ${KEY_ACTIONS.find((a) => a.id === capturing!.action)?.label}'s.` : "";
      capturing = null; draw();
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  const close = (): void => { page.style.display = "none"; capturing = null; note = ""; window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true); };
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu"]) page.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  return {
    open(): void { capturing = null; note = ""; armed(); draw(); page.style.display = "block"; window.addEventListener("keydown", onKey, true); window.addEventListener("keyup", onKey, true); },
    close,
    get isOpen() { return page.style.display !== "none"; },
    element: page,
  };
}
